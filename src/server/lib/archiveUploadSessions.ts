import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { logServerError } from "./logger.js";
import { importArchiveZip, type ArchiveImportResult } from "./userArchiveStore.js";

// Each piece is stored as its own file keyed by byte offset, so the browser can
// upload several pieces concurrently — a single serialized stream is far too
// slow across the HTTP proxy in front of this server. 4 MB is the largest body
// that proxy reliably accepts.
export const ARCHIVE_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
export const ARCHIVE_UPLOAD_CONCURRENCY = 4;
const MAX_ARCHIVE_UPLOAD_BYTES = 20 * 1024 * 1024 * 1024;
const MAX_FINGERPRINT_LENGTH = 256;
const MAX_REPORTED_RANGES = 20_000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

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

type UploadSession = {
  id: string;
  dir: string;
  partsDir: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  fingerprint: string;
  parts: Map<number, number>;
  receivedBytes: number;
  touchedAt: number;
  phase: "uploading" | "assembling" | "importing" | "done" | "failed";
  // Set for archives imported straight off the volume: the file is not ours to delete.
  keepSourceFile?: boolean;
  result?: ArchiveImportResult;
  error?: string;
};

const sessions = new Map<string, UploadSession>();

async function discardSession(session: UploadSession): Promise<void> {
  sessions.delete(session.id);
  if (session.dir.length > 0) {
    await rm(session.dir, { recursive: true, force: true }).catch(() => undefined);
  }
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
}): Promise<{ uploadId: string; chunkBytes: number; concurrency: number; receivedRanges: ReceivedRange[] }> {
  purgeStaleSessions();

  if (input.fileSize > MAX_ARCHIVE_UPLOAD_BYTES) {
    throw new Error("Archive is too large");
  }

  const dir = await mkdtemp(join(tmpdir(), "chara2img-upload-"));
  const partsDir = join(dir, "parts");
  await mkdir(partsDir, { recursive: true });

  const session: UploadSession = {
    id: randomUUID(),
    dir,
    partsDir,
    filePath: join(dir, "archive.zip"),
    fileName: input.fileName.slice(0, MAX_FINGERPRINT_LENGTH),
    fileSize: input.fileSize,
    fingerprint: input.fingerprint.slice(0, MAX_FINGERPRINT_LENGTH),
    parts: new Map(),
    receivedBytes: 0,
    touchedAt: Date.now(),
    phase: "uploading"
  };
  sessions.set(session.id, session);

  return {
    uploadId: session.id,
    chunkBytes: ARCHIVE_UPLOAD_CHUNK_BYTES,
    concurrency: ARCHIVE_UPLOAD_CONCURRENCY,
    receivedRanges: []
  };
}

function listReceivedRanges(session: UploadSession): ReceivedRange[] {
  return Array.from(session.parts.entries())
    .sort((left, right) => left[0] - right[0])
    .slice(0, MAX_REPORTED_RANGES);
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
        chunkBytes: ARCHIVE_UPLOAD_CHUNK_BYTES,
        concurrency: ARCHIVE_UPLOAD_CONCURRENCY,
        fileName: session.fileName,
        fileSize: session.fileSize,
        fingerprint: session.fingerprint,
        receivedRanges: listReceivedRanges(session)
      };
    case "assembling":
      return { status: "assembling" };
    case "importing":
      return { status: "importing" };
    case "done":
      return { status: "done", result: session.result! };
    case "failed":
      return { status: "failed", error: session.error ?? "Import failed" };
  }
}

export type ChunkAppendResult =
  | { ok: true; receivedBytes: number }
  | { ok: false; status: 404 | 409 | 413; error: string; receivedBytes?: number };

export async function appendArchiveUploadChunk(
  uploadId: string,
  offset: number,
  data: Buffer
): Promise<ChunkAppendResult> {
  const session = sessions.get(uploadId);
  if (!session || session.phase !== "uploading") {
    return { ok: false, status: 404, error: "Unknown or completed upload session" };
  }

  if (data.byteLength === 0 || offset + data.byteLength > session.fileSize) {
    return { ok: false, status: 409, error: "Chunk falls outside the declared file size" };
  }

  // A re-sent piece is rewritten rather than duplicated, so retries are free.
  const previousLength = session.parts.get(offset);
  await writeFile(join(session.partsDir, `${offset}.part`), data);
  session.parts.set(offset, data.byteLength);
  session.receivedBytes += data.byteLength - (previousLength ?? 0);
  session.touchedAt = Date.now();

  return { ok: true, receivedBytes: session.receivedBytes };
}

/** Concatenate the parts in offset order, rejecting gaps or overlaps. */
async function assembleUpload(session: UploadSession): Promise<void> {
  const ordered = Array.from(session.parts.entries()).sort((left, right) => left[0] - right[0]);

  let expectedOffset = 0;
  for (const [offset, length] of ordered) {
    if (offset !== expectedOffset) {
      throw new Error(`Upload is incomplete at byte ${expectedOffset}`);
    }
    expectedOffset += length;
  }
  if (expectedOffset !== session.fileSize) {
    throw new Error(`Upload is incomplete: received ${expectedOffset} of ${session.fileSize} bytes`);
  }

  const destination = createWriteStream(session.filePath);
  for (const [offset] of ordered) {
    await pipeline(createReadStream(join(session.partsDir, `${offset}.part`)), destination, { end: false });
  }
  await new Promise<void>((resolve, reject) => {
    destination.end((error?: Error | null) => (error ? reject(error) : resolve()));
  });

  await rm(session.partsDir, { recursive: true, force: true });
}

/**
 * Assemble and import in the background. The caller polls
 * getArchiveUploadProgress, so a slow import can never outlive a request.
 */
export function startArchiveUploadImport(uploadId: string): boolean {
  const session = sessions.get(uploadId);
  if (!session || session.phase !== "uploading") {
    return false;
  }

  session.phase = "assembling";
  session.touchedAt = Date.now();

  void assembleUpload(session)
    .then(() => runSessionImport(session))
    .catch((error: unknown) => failSession(session, error));

  return true;
}

function failSession(session: UploadSession, error: unknown): void {
  logServerError("Archive import failed", error, { uploadId: session.id });
  session.phase = "failed";
  session.error = error instanceof Error ? error.message : "Import failed";
  session.touchedAt = Date.now();
}

async function runSessionImport(session: UploadSession): Promise<void> {
  session.phase = "importing";
  session.touchedAt = Date.now();

  try {
    session.result = await importArchiveZip(session.filePath);
    session.phase = "done";
  } catch (error) {
    failSession(session, error);
  } finally {
    session.touchedAt = Date.now();
    if (!session.keepSourceFile) {
      await rm(session.filePath, { force: true }).catch(() => undefined);
    }
  }
}

/** Import an archive that is already on disk (dropped into the import folder). */
export function startLocalArchiveImport(filePath: string, fileName: string): string {
  purgeStaleSessions();

  const session: UploadSession = {
    id: randomUUID(),
    dir: "",
    partsDir: "",
    filePath,
    fileName,
    fileSize: 0,
    fingerprint: "",
    parts: new Map(),
    receivedBytes: 0,
    touchedAt: Date.now(),
    phase: "importing",
    keepSourceFile: true
  };
  sessions.set(session.id, session);

  void runSessionImport(session);

  return session.id;
}

export async function abortArchiveUpload(uploadId: string): Promise<void> {
  const session = sessions.get(uploadId);
  if (session) {
    await discardSession(session);
  }
}
