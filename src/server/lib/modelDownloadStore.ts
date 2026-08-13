import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DownloadEntry, DownloadSource } from "../../shared/contracts/modelDownloads.js";
import { resolveNetworkPath } from "./networkPaths.js";

function getDownloadsDir(): string {
  return resolveNetworkPath("DOWNLOADS_LOG_DIR", "chara2img/downloads");
}

function storeFilePath(): string {
  return join(getDownloadsDir(), "downloads.json");
}

// ─── In-memory state ──────────────────────────────────────────────────────────

let entries: DownloadEntry[] = [];
let initialized = false;

// ─── Persistence ─────────────────────────────────────────────────────────────

async function readFromDisk(): Promise<DownloadEntry[]> {
  try {
    const raw = await readFile(storeFilePath(), "utf8");
    const parsed = JSON.parse(raw) as { downloads?: DownloadEntry[] };
    return Array.isArray(parsed.downloads) ? parsed.downloads : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeToDisk(): Promise<void> {
  await mkdir(getDownloadsDir(), { recursive: true });
  await writeFile(storeFilePath(), JSON.stringify({ downloads: entries }, null, 2), "utf8");
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initDownloadStore(): Promise<void> {
  entries = await readFromDisk();
  for (const entry of entries) {
    if (entry.status === "in_progress") {
      // server was killed mid-download; re-queue so it can restart
      entry.status = "queued";
      entry.bytesDownloaded = 0;
    }
  }
  initialized = true;
  await writeToDisk();
}

function assertInitialized(): void {
  if (!initialized) throw new Error("Download store not initialized — call initDownloadStore() at startup");
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export function listDownloads(): DownloadEntry[] {
  assertInitialized();
  return [...entries];
}

export function getDownload(id: string): DownloadEntry | null {
  assertInitialized();
  return entries.find((e) => e.id === id) ?? null;
}

export function getNextQueued(): DownloadEntry | null {
  assertInitialized();
  return entries.find((e) => e.status === "queued") ?? null;
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function addDownload(
  url: string,
  destPath: string,
  source: DownloadSource,
  filename: string,
): Promise<DownloadEntry> {
  assertInitialized();
  const entry: DownloadEntry = {
    id: randomUUID(),
    source,
    url,
    destPath,
    filename,
    status: "queued",
    bytesDownloaded: 0,
    totalBytes: 0,
    createdAt: new Date().toISOString(),
    completedAt: null,
    error: null,
  };
  entries.push(entry);
  await writeToDisk();
  return { ...entry };
}

// Persists status/metadata changes (not called for progress updates).
export async function updateEntry(id: string, patch: Partial<DownloadEntry>): Promise<boolean> {
  assertInitialized();
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1) return false;
  entries[index] = { ...entries[index], ...patch };
  await writeToDisk();
  return true;
}

// In-memory only — avoids thrashing disk on every progress tick.
export function updateProgress(id: string, bytesDownloaded: number, totalBytes: number): void {
  const entry = entries.find((e) => e.id === id);
  if (entry) {
    entry.bytesDownloaded = bytesDownloaded;
    entry.totalBytes = totalBytes;
  }
}

export async function removeDownload(id: string): Promise<boolean> {
  assertInitialized();
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1) return false;
  entries.splice(index, 1);
  await writeToDisk();
  return true;
}
