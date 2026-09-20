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

export type ReceivedRange = [offset: number, length: number];

export type ArchiveImportProgress =
  | {
      status: "uploading";
      receivedBytes: number;
      chunkBytes: number;
      concurrency: number;
      fileName: string;
      fileSize: number;
      fingerprint: string;
      receivedRanges: ReceivedRange[];
    }
  | { status: "assembling" }
  | { status: "importing" }
  | { status: "done"; result: ArchiveImportResult }
  | { status: "failed"; error: string };

export type ArchiveUploadSession = {
  uploadId: string;
  chunkBytes: number;
  concurrency: number;
  receivedRanges: ReceivedRange[];
};

const CHUNK_RETRY_ATTEMPTS = 6;
const CHUNK_RETRY_BASE_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8000;
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

export type ImportableArchive = { fileName: string; sizeBytes: number; modifiedAt: string };

export async function fetchImportableArchives(): Promise<{ directory: string; files: ImportableArchive[] }> {
  const response = await fetch("/api/admin/archives/import/files", { credentials: "include" });
  const body = await readJson(response);
  if (!response.ok || body.ok !== true) {
    throw new Error(typeof body.error === "string" ? body.error : `Failed to list import folder: ${response.status}`);
  }
  return { directory: String(body.directory ?? ""), files: (body.files ?? []) as ImportableArchive[] };
}

/** Import an archive already sitting in the server's import folder. */
export async function startImportableArchive(fileName: string): Promise<string> {
  const response = await fetch("/api/admin/archives/import/files", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName })
  });
  const body = await readJson(response);
  if (!response.ok || body.ok !== true) {
    throw new Error(typeof body.error === "string" ? body.error : `Import could not start: ${response.status}`);
  }
  return String(body.uploadId);
}

export type UploadPiece = { offset: number; length: number };

/**
 * Pieces are cut on a fixed grid so a resumed upload lines up exactly with the
 * parts the server already holds.
 */
export function computePendingPieces(
  fileSize: number,
  chunkBytes: number,
  receivedRanges: ReceivedRange[]
): UploadPiece[] {
  const receivedByOffset = new Map(receivedRanges);
  const pieces: UploadPiece[] = [];

  for (let offset = 0; offset < fileSize; offset += chunkBytes) {
    const length = Math.min(chunkBytes, fileSize - offset);
    if (receivedByOffset.get(offset) !== length) {
      pieces.push({ offset, length });
    }
  }

  return pieces;
}

async function sendPiece(
  file: File,
  uploadId: string,
  piece: UploadPiece,
  signal?: AbortSignal
): Promise<void> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < CHUNK_RETRY_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException("Upload cancelled", "AbortError");
    }

    try {
      const response = await fetch(
        `/api/admin/archives/import/session/${encodeURIComponent(uploadId)}/chunk?offset=${piece.offset}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/octet-stream" },
          body: file.slice(piece.offset, piece.offset + piece.length),
          signal
        }
      );
      const body = await readJson(response);

      if (response.ok && body.ok === true) {
        return;
      }

      if (response.status === 404 || response.status === 413) {
        throw new Error(typeof body.error === "string" ? body.error : "Upload session is no longer valid");
      }

      lastError = new Error(
        typeof body.error === "string" ? body.error : `Upload failed at byte ${piece.offset}`
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      lastError = error;
    }

    await delay(Math.min(CHUNK_RETRY_BASE_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS));
  }

  throw lastError instanceof Error ? lastError : new Error(`Upload failed at byte ${piece.offset}`);
}

/**
 * Upload the pieces the server is still missing, several at a time. Each piece
 * is addressed by offset, so an interrupted upload resumes rather than restarts.
 */
export async function uploadArchiveChunks(
  file: File,
  session: ArchiveUploadSession,
  options: { onProgress?: (uploadedBytes: number) => void; signal?: AbortSignal } = {}
): Promise<void> {
  const pieces = computePendingPieces(file.size, session.chunkBytes, session.receivedRanges);
  const pendingBytes = pieces.reduce((total, piece) => total + piece.length, 0);

  let uploadedBytes = file.size - pendingBytes;
  let cursor = 0;
  options.onProgress?.(uploadedBytes);

  const uploadWorker = async (): Promise<void> => {
    for (;;) {
      const piece = pieces[cursor];
      if (!piece) {
        return;
      }
      cursor += 1;

      await sendPiece(file, session.uploadId, piece, options.signal);
      uploadedBytes += piece.length;
      options.onProgress?.(uploadedBytes);
    }
  };

  const workerCount = Math.max(1, Math.min(session.concurrency, pieces.length));
  await Promise.all(Array.from({ length: workerCount }, uploadWorker));
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
