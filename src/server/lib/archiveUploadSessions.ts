import { randomUUID } from "node:crypto";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logServerError } from "./logger.js";
import { importArchiveZip, type ArchiveImportResult } from "./userArchiveStore.js";

// Uploads arrive in chunks because a single multi-gigabyte request does not
// survive the HTTP proxy in front of this server.
export const ARCHIVE_UPLOAD_CHUNK_BYTES = 16 * 1024 * 1024;
const MAX_ARCHIVE_UPLOAD_BYTES = 20 * 1024 * 1024 * 1024;
const MAX_FINGERPRINT_LENGTH = 256;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

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

type UploadSession = {
  id: string;
  dir: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  fingerprint: string;
  receivedBytes: number;
  nextChunkIndex: number;
  touchedAt: number;
  phase: "uploading" | "importing" | "done" | "failed";
  result?: ArchiveImportResult;
  error?: string;
};

const sessions = new Map<string, UploadSession>();

async function discardSession(session: UploadSession): Promise<void> {
  sessions.delete(session.id);
  await rm(session.dir, { recursive: true, force: true }).catch(() => undefined);
}

function purgeStaleSessions(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const session of sessions.values()) {
    if (session.touchedAt < cutoff) {
      void discardSession(session);
    }
  }
}

export async function createArchiveUploadSession(input: {
  fileName: string;
  fileSize: number;
  fingerprint: string;
}): Promise<{ uploadId: string; chunkBytes: number; receivedBytes: number; nextChunkIndex: number }> {
  purgeStaleSessions();

  const dir = await mkdtemp(join(tmpdir(), "chara2img-upload-"));
  const session: UploadSession = {
    id: randomUUID(),
    dir,
    filePath: join(dir, "archive.zip"),
    fileName: input.fileName.slice(0, MAX_FINGERPRINT_LENGTH),
    fileSize: input.fileSize,
    fingerprint: input.fingerprint.slice(0, MAX_FINGERPRINT_LENGTH),
    receivedBytes: 0,
    nextChunkIndex: 0,
    touchedAt: Date.now(),
    phase: "uploading"
  };
  await writeFile(session.filePath, Buffer.alloc(0));
  sessions.set(session.id, session);

  return {
    uploadId: session.id,
    chunkBytes: ARCHIVE_UPLOAD_CHUNK_BYTES,
    receivedBytes: 0,
    nextChunkIndex: 0
  };
}

export function getArchiveUploadProgress(uploadId: string): ArchiveImportProgress | null {
  const session = sessions.get(uploadId);
  if (!session) {
    return null;
  }

  switch (session.phase) {
    case "uploading":
      return {
        status: "uploading",
        receivedBytes: session.receivedBytes,
        nextChunkIndex: session.nextChunkIndex,
        chunkBytes: ARCHIVE_UPLOAD_CHUNK_BYTES,
        fileName: session.fileName,
        fileSize: session.fileSize,
        fingerprint: session.fingerprint
      };
    case "importing":
      return { status: "importing" };
    case "done":
      return { status: "done", result: session.result! };
    case "failed":
      return { status: "failed", error: session.error ?? "Import failed" };
  }
}

export type ChunkAppendResult =
  | { ok: true; receivedBytes: number; nextChunkIndex: number }
  | { ok: false; status: 404 | 409 | 413; error: string; nextChunkIndex?: number };

export async function appendArchiveUploadChunk(
  uploadId: string,
  chunkIndex: number,
  data: Buffer
): Promise<ChunkAppendResult> {
  const session = sessions.get(uploadId);
  if (!session || session.phase !== "uploading") {
    return { ok: false, status: 404, error: "Unknown or completed upload session" };
  }

  // A retried chunk that already landed is acknowledged, so a flaky connection
  // never wedges the upload.
  if (chunkIndex === session.nextChunkIndex - 1) {
    return { ok: true, receivedBytes: session.receivedBytes, nextChunkIndex: session.nextChunkIndex };
  }

  if (chunkIndex !== session.nextChunkIndex) {
    return {
      ok: false,
      status: 409,
      error: `Expected chunk ${session.nextChunkIndex}`,
      nextChunkIndex: session.nextChunkIndex
    };
  }

  if (session.receivedBytes + data.byteLength > MAX_ARCHIVE_UPLOAD_BYTES) {
    await discardSession(session);
    return { ok: false, status: 413, error: "Archive is too large" };
  }

  await appendFile(session.filePath, data);
  session.receivedBytes += data.byteLength;
  session.nextChunkIndex += 1;
  session.touchedAt = Date.now();

  return { ok: true, receivedBytes: session.receivedBytes, nextChunkIndex: session.nextChunkIndex };
}

/**
 * Import the uploaded archive in the background. The caller polls
 * getArchiveUploadProgress, so a slow import can never outlive a request.
 */
export function startArchiveUploadImport(uploadId: string): boolean {
  const session = sessions.get(uploadId);
  if (!session || session.phase !== "uploading") {
    return false;
  }

  session.phase = "importing";
  session.touchedAt = Date.now();

  void importArchiveZip(session.filePath)
    .then((result) => {
      session.phase = "done";
      session.result = result;
    })
    .catch((error: unknown) => {
      logServerError("Archive import failed", error, { uploadId });
      session.phase = "failed";
      session.error = error instanceof Error ? error.message : "Import failed";
    })
    .finally(() => {
      session.touchedAt = Date.now();
      void rm(session.filePath, { force: true }).catch(() => undefined);
    });

  return true;
}

export async function abortArchiveUpload(uploadId: string): Promise<void> {
  const session = sessions.get(uploadId);
  if (session) {
    await discardSession(session);
  }
}
