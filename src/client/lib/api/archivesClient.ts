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
};

const CHUNK_RETRY_ATTEMPTS = 6;
const CHUNK_RETRY_BASE_DELAY_MS = 750;
const MIN_CHUNK_BYTES = 256 * 1024;
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

type ChunkOutcome = { receivedBytes: number; chunkBytes: number };

/**
 * Send one piece and report the server's new offset. A transport-level failure
 * (the proxy resetting an oversized request) halves the size and retries, so
 * the upload settles on a size the network in front of the server tolerates.
 */
async function sendChunk(
  file: File,
  uploadId: string,
  offset: number,
  chunkBytes: number,
  signal?: AbortSignal
): Promise<ChunkOutcome> {
  let size = chunkBytes;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < CHUNK_RETRY_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException("Upload cancelled", "AbortError");
    }

    const blob = file.slice(offset, Math.min(offset + size, file.size));

    try {
      const response = await fetch(
        `/api/admin/archives/import/session/${encodeURIComponent(uploadId)}/chunk?offset=${offset}`,
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
        return { receivedBytes: Number(body.receivedBytes ?? offset + blob.size), chunkBytes: size };
      }

      // The server is at a different offset; realign rather than retry blindly.
      if (response.status === 409 && typeof body.receivedBytes === "number") {
        return { receivedBytes: body.receivedBytes, chunkBytes: size };
      }

      if (response.status === 404 || response.status === 413) {
        throw new Error(typeof body.error === "string" ? body.error : "Upload session is no longer valid");
      }

      lastError = new Error(typeof body.error === "string" ? body.error : `Upload failed at ${offset} bytes`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      lastError = error;
      // TypeError means the request never completed (stream reset, connection
      // dropped); a smaller body is the thing most likely to get through.
      if (error instanceof TypeError && size > MIN_CHUNK_BYTES) {
        size = Math.max(MIN_CHUNK_BYTES, Math.floor(size / 2));
      }
    }

    await delay(CHUNK_RETRY_BASE_DELAY_MS * 2 ** attempt);
  }

  throw lastError instanceof Error ? lastError : new Error(`Upload failed at ${offset} bytes`);
}

/**
 * Upload from `session.receivedBytes` onward, so an interrupted upload resumes
 * where the server left off instead of restarting.
 */
export async function uploadArchiveChunks(
  file: File,
  session: ArchiveUploadSession,
  options: { onProgress?: (uploadedBytes: number) => void; signal?: AbortSignal } = {}
): Promise<void> {
  let offset = Math.min(session.receivedBytes, file.size);
  let chunkBytes = Math.max(MIN_CHUNK_BYTES, session.chunkBytes);
  options.onProgress?.(offset);

  while (offset < file.size) {
    const outcome = await sendChunk(file, session.uploadId, offset, chunkBytes, options.signal);
    if (outcome.receivedBytes <= offset) {
      throw new Error(`Upload stalled at ${offset} bytes`);
    }
    offset = Math.min(outcome.receivedBytes, file.size);
    chunkBytes = outcome.chunkBytes;
    options.onProgress?.(offset);
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
