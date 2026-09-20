import type { UserArchiveSummary } from "../../../shared/contracts/archives";

export async function fetchUserArchives(): Promise<UserArchiveSummary[]> {
  const response = await fetch("/api/admin/archives", { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to load archive usage: ${response.status}`);
  }
  const body = (await response.json()) as { ok: boolean; users: UserArchiveSummary[] };
  return body.users;
}

export function userArchiveDownloadUrl(username: string): string {
  return `/api/admin/archives/${encodeURIComponent(username)}/download`;
}

export type ArchiveImportResult = {
  importedJobs: number;
  importedImages: number;
  skippedExistingJobs: number;
  ignoredEntries: number;
  warnings: string[];
};

export type ArchiveImportProgress =
  | {
      status: "uploading";
      receivedBytes: number;
      nextChunkIndex: number;
      chunkBytes: number;
      fileName: string;
      fileSize: number;
      fingerprint: string;
    }
  | { status: "importing" }
  | { status: "done"; result: ArchiveImportResult }
  | { status: "failed"; error: string };

export type ArchiveUploadSession = {
  uploadId: string;
  chunkBytes: number;
  receivedBytes: number;
  nextChunkIndex: number;
};

const CHUNK_RETRY_ATTEMPTS = 4;
const CHUNK_RETRY_BASE_DELAY_MS = 1000;
const IMPORT_POLL_INTERVAL_MS = 2000;

/** Identifies a local file well enough to refuse resuming onto a different one. */
export function archiveFingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createArchiveUploadSession(file: File): Promise<ArchiveUploadSession> {
  const response = await fetch("/api/admin/archives/import/session", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      fingerprint: archiveFingerprint(file)
    })
  });
  const body = await readJson(response);
  if (!response.ok || body.ok !== true) {
    throw new Error(typeof body.error === "string" ? body.error : `Upload could not start: ${response.status}`);
  }
  return body as unknown as ArchiveUploadSession;
}

export async function fetchArchiveUploadProgress(uploadId: string): Promise<ArchiveImportProgress | null> {
  const response = await fetch(`/api/admin/archives/import/session/${encodeURIComponent(uploadId)}`, {
    credentials: "include"
  });
  if (response.status === 404) {
    return null;
  }
  const body = await readJson(response);
  if (!response.ok || body.ok !== true) {
    throw new Error(typeof body.error === "string" ? body.error : `Upload status failed: ${response.status}`);
  }
  return body as unknown as ArchiveImportProgress;
}

export async function abortArchiveUpload(uploadId: string): Promise<void> {
  await fetch(`/api/admin/archives/import/session/${encodeURIComponent(uploadId)}`, {
    method: "DELETE",
    credentials: "include"
  }).catch(() => undefined);
}

async function sendChunk(
  uploadId: string,
  chunkIndex: number,
  blob: Blob,
  signal?: AbortSignal
): Promise<number> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < CHUNK_RETRY_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException("Upload cancelled", "AbortError");
    }

    try {
      const response = await fetch(
        `/api/admin/archives/import/session/${encodeURIComponent(uploadId)}/chunk?index=${chunkIndex}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/octet-stream" },
          body: blob,
          signal
        }
      );
      const body = await readJson(response);

      if (response.ok && body.ok === true) {
        return Number(body.nextChunkIndex ?? chunkIndex + 1);
      }

      // The server is at a different offset; realign rather than retry blindly.
      if (response.status === 409 && typeof body.nextChunkIndex === "number") {
        return body.nextChunkIndex;
      }

      if (response.status === 404 || response.status === 413) {
        throw new Error(typeof body.error === "string" ? body.error : "Upload session is no longer valid");
      }

      lastError = new Error(typeof body.error === "string" ? body.error : `Chunk ${chunkIndex} failed`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      lastError = error;
    }

    await delay(CHUNK_RETRY_BASE_DELAY_MS * 2 ** attempt);
  }

  throw lastError instanceof Error ? lastError : new Error(`Chunk ${chunkIndex} failed`);
}

/**
 * Upload from `session.nextChunkIndex` onward, so an interrupted upload resumes
 * where the server left off instead of restarting.
 */
export async function uploadArchiveChunks(
  file: File,
  session: ArchiveUploadSession,
  options: { onProgress?: (uploadedBytes: number) => void; signal?: AbortSignal } = {}
): Promise<void> {
  const totalChunks = Math.max(1, Math.ceil(file.size / session.chunkBytes));
  let chunkIndex = session.nextChunkIndex;
  options.onProgress?.(Math.min(chunkIndex * session.chunkBytes, file.size));

  while (chunkIndex < totalChunks) {
    const start = chunkIndex * session.chunkBytes;
    const blob = file.slice(start, Math.min(start + session.chunkBytes, file.size));
    chunkIndex = await sendChunk(session.uploadId, chunkIndex, blob, options.signal);
    options.onProgress?.(Math.min(chunkIndex * session.chunkBytes, file.size));
  }
}

export async function finishArchiveUpload(uploadId: string): Promise<void> {
  const response = await fetch(`/api/admin/archives/import/session/${encodeURIComponent(uploadId)}/finish`, {
    method: "POST",
    credentials: "include"
  });
  const body = await readJson(response);
  if (!response.ok || body.ok !== true) {
    throw new Error(typeof body.error === "string" ? body.error : `Import could not start: ${response.status}`);
  }
}

export async function waitForArchiveImport(
  uploadId: string,
  options: { signal?: AbortSignal } = {}
): Promise<ArchiveImportResult> {
  for (;;) {
    if (options.signal?.aborted) {
      throw new DOMException("Import cancelled", "AbortError");
    }

    const progress = await fetchArchiveUploadProgress(uploadId);
    if (!progress) {
      throw new Error("Import session expired before it finished");
    }
    if (progress.status === "done") {
      return progress.result;
    }
    if (progress.status === "failed") {
      throw new Error(progress.error);
    }

    await delay(IMPORT_POLL_INTERVAL_MS);
  }
}
