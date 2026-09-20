import { createWriteStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { open as openZip, type Entry, type ZipFile } from "yauzl";
import { ANONYMOUS_ARCHIVE_OWNER, type UserArchiveSummary } from "../../shared/contracts/archives.js";
import type { JobRecord } from "../../shared/contracts/jobs.js";
import { getJobArchiveDir, getJobTmpDir, readJobAnywhere } from "./jobStore.js";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".webp"];
const MAX_IMPORT_ENTRIES = 50_000;
const MAX_IMPORT_UNCOMPRESSED_BYTES = 20 * 1024 * 1024 * 1024;

export type ArchiveFile = {
  absolutePath: string;
  fileName: string;
  sizeBytes: number;
  isImage: boolean;
};

export type UserArchiveJob = {
  job: JobRecord;
  files: ArchiveFile[];
};

function isImageFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function archiveOwnerOf(job: Pick<JobRecord, "createdBy">): string {
  const createdBy = job.createdBy ?? null;
  return createdBy === null || createdBy.length === 0 ? ANONYMOUS_ARCHIVE_OWNER : createdBy;
}

async function listJobIdsIn(base: string): Promise<string[]> {
  try {
    const entries = (await readdir(join(base, "jobs"), { withFileTypes: true })) as unknown as {
      name: string;
      isDirectory(): boolean;
    }[];
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function listJobFiles(jobId: string): Promise<ArchiveFile[]> {
  const byFileName = new Map<string, ArchiveFile>();

  // Archive is scanned first so a pinned copy wins over a stale tmp duplicate.
  for (const base of [getJobArchiveDir(), getJobTmpDir()]) {
    const dir = join(base, "jobs", jobId);
    let entries: { name: string; isFile(): boolean }[];
    try {
      entries = (await readdir(dir, { withFileTypes: true })) as unknown as { name: string; isFile(): boolean }[];
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }

    for (const entry of entries) {
      if (!entry.isFile() || entry.name.endsWith(".tmp") || byFileName.has(entry.name)) continue;
      const absolutePath = join(dir, entry.name);
      try {
        const fileStat = await stat(absolutePath);
        byFileName.set(entry.name, {
          absolutePath,
          fileName: entry.name,
          sizeBytes: fileStat.size,
          isImage: isImageFile(entry.name)
        });
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    }
  }

  return Array.from(byFileName.values()).sort((left, right) => left.fileName.localeCompare(right.fileName));
}

async function collectArchiveJobs(): Promise<Map<string, UserArchiveJob[]>> {
  const jobIds = Array.from(
    new Set([...(await listJobIdsIn(getJobTmpDir())), ...(await listJobIdsIn(getJobArchiveDir()))])
  );

  const entries = await Promise.all(
    jobIds.map(async (jobId): Promise<UserArchiveJob | null> => {
      const job = await readJobAnywhere(jobId);
      if (!job) return null;
      return { job, files: await listJobFiles(jobId) };
    })
  );

  const byOwner = new Map<string, UserArchiveJob[]>();
  for (const entry of entries) {
    if (entry === null) continue;
    const owner = archiveOwnerOf(entry.job);
    const bucket = byOwner.get(owner);
    if (bucket) {
      bucket.push(entry);
    } else {
      byOwner.set(owner, [entry]);
    }
  }

  for (const bucket of byOwner.values()) {
    bucket.sort((left, right) => Date.parse(right.job.submittedAt) - Date.parse(left.job.submittedAt));
  }

  return byOwner;
}

export function summarizeArchiveJobs(username: string, jobs: UserArchiveJob[]): UserArchiveSummary {
  let imageCount = 0;
  let imageBytes = 0;
  let metadataBytes = 0;

  for (const entry of jobs) {
    for (const file of entry.files) {
      if (file.isImage) {
        imageCount += 1;
        imageBytes += file.sizeBytes;
      } else {
        metadataBytes += file.sizeBytes;
      }
    }
  }

  return {
    username,
    jobCount: jobs.length,
    imageCount,
    imageBytes,
    metadataBytes,
    totalBytes: imageBytes + metadataBytes
  };
}

/** Per-user disk usage, including known users with no stored jobs. */
export async function listUserArchiveSummaries(knownUsernames: string[]): Promise<UserArchiveSummary[]> {
  const byOwner = await collectArchiveJobs();
  const owners = new Set<string>([ANONYMOUS_ARCHIVE_OWNER, ...knownUsernames, ...byOwner.keys()]);

  return Array.from(owners)
    .map((owner) => summarizeArchiveJobs(owner, byOwner.get(owner) ?? []))
    .sort((left, right) => right.totalBytes - left.totalBytes || left.username.localeCompare(right.username));
}

export async function listUserArchiveJobs(username: string): Promise<UserArchiveJob[]> {
  const byOwner = await collectArchiveJobs();
  return byOwner.get(username) ?? [];
}

// ─── Import ───────────────────────────────────────────────────────────────────

export type ArchiveImportResult = {
  importedJobs: number;
  importedImages: number;
  skippedExistingJobs: number;
  ignoredEntries: number;
  warnings: string[];
};

// Rejects "." and ".." (and therefore path traversal) by requiring an alphanumeric first character.
const SAFE_ENTRY_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_IMPORT_WARNINGS = 20;

function isImportableFileName(fileName: string): boolean {
  return fileName === "job.json" || fileName === "inputs.json" || isImageFile(fileName);
}

/** Map a zip entry to its staging path, or null when the entry must be ignored. */
export function resolveImportEntryPath(entryName: string, stagingDir: string): string | null {
  if (entryName.endsWith("/") || entryName.includes("\\") || entryName.startsWith("/")) {
    return null;
  }

  const segments = entryName.split("/");
  if (segments.length !== 3) {
    return null;
  }

  const [root, folder, fileName] = segments as [string, string, string];
  if (root !== "jobs" || !SAFE_ENTRY_NAME.test(folder) || !SAFE_ENTRY_NAME.test(fileName)) {
    return null;
  }

  return isImportableFileName(fileName) ? join(stagingDir, folder, fileName) : null;
}

function extractImportZip(zipPath: string, stagingDir: string): Promise<{ ignoredEntries: number }> {
  return new Promise((resolve, reject) => {
    openZip(zipPath, { lazyEntries: true }, (openError: Error | null, zip?: ZipFile) => {
      if (openError || !zip) {
        reject(openError ?? new Error("Archive could not be read"));
        return;
      }

      let entryCount = 0;
      let uncompressedBytes = 0;
      let ignoredEntries = 0;

      const fail = (error: Error): void => {
        zip.close();
        reject(error);
      };

      zip.on("entry", (entry: Entry) => {
        entryCount += 1;
        uncompressedBytes += entry.uncompressedSize;
        if (entryCount > MAX_IMPORT_ENTRIES) {
          fail(new Error("Archive contains too many entries"));
          return;
        }
        if (uncompressedBytes > MAX_IMPORT_UNCOMPRESSED_BYTES) {
          fail(new Error("Archive contents are too large"));
          return;
        }

        const targetPath = resolveImportEntryPath(entry.fileName, stagingDir);
        if (!targetPath) {
          ignoredEntries += 1;
          zip.readEntry();
          return;
        }

        zip.openReadStream(entry, (streamError: Error | null, readStream?: NodeJS.ReadableStream) => {
          if (streamError || !readStream) {
            fail(streamError ?? new Error("Archive entry could not be read"));
            return;
          }

          void mkdir(dirname(targetPath), { recursive: true })
            .then(() => pipeline(readStream, createWriteStream(targetPath)))
            .then(() => zip.readEntry())
            .catch(fail);
        });
      });

      zip.on("end", () => resolve({ ignoredEntries }));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

function parseImportedImageIndex(fileName: string, displayName: string): number | null {
  const prefix = `${displayName}-`;
  if (!fileName.startsWith(prefix)) {
    return null;
  }

  const match = /^(\d+)\.(png|jpg|webp)$/i.exec(fileName.slice(prefix.length));
  return match ? Number.parseInt(match[1]!, 10) : null;
}

/**
 * Restore an exported archive into the permanent archive dir. Jobs already known
 * to this server are left untouched, so re-importing the same zip is a no-op.
 */
export async function importArchiveZip(zipPath: string): Promise<ArchiveImportResult> {
  const stagingDir = await mkdtemp(join(tmpdir(), "chara2img-import-"));
  const result: ArchiveImportResult = {
    importedJobs: 0,
    importedImages: 0,
    skippedExistingJobs: 0,
    ignoredEntries: 0,
    warnings: []
  };

  const warn = (message: string): void => {
    if (result.warnings.length < MAX_IMPORT_WARNINGS) {
      result.warnings.push(message);
    }
  };

  try {
    result.ignoredEntries = (await extractImportZip(zipPath, stagingDir)).ignoredEntries;

    let folders: { name: string; isDirectory(): boolean }[];
    try {
      folders = (await readdir(stagingDir, { withFileTypes: true })) as unknown as {
        name: string;
        isDirectory(): boolean;
      }[];
    } catch {
      folders = [];
    }

    for (const folder of folders) {
      if (!folder.isDirectory()) continue;
      const sourceDir = join(stagingDir, folder.name);

      let job: JobRecord;
      try {
        job = JSON.parse(await readFile(join(sourceDir, "job.json"), "utf8")) as JobRecord;
      } catch {
        warn(`${folder.name}: missing or unreadable job.json`);
        continue;
      }

      if (!SAFE_ENTRY_NAME.test(job.jobId ?? "") || !SAFE_ENTRY_NAME.test(job.displayName ?? "")) {
        warn(`${folder.name}: job.json has an unusable jobId or displayName`);
        continue;
      }

      if (await readJobAnywhere(job.jobId)) {
        result.skippedExistingJobs += 1;
        continue;
      }

      const fileNames = await readdir(sourceDir);
      const presentIndices = new Set<number>();
      for (const fileName of fileNames) {
        const index = parseImportedImageIndex(fileName, job.displayName);
        if (index !== null) presentIndices.add(index);
      }

      const destinationDir = join(getJobArchiveDir(), "jobs", job.jobId);
      await mkdir(destinationDir, { recursive: true });
      for (const fileName of fileNames) {
        if (fileName === "job.json") continue;
        await copyFile(join(sourceDir, fileName), join(destinationDir, fileName));
      }

      // Imported jobs live in the archive dir only, so they must never expire and
      // every restored image has to be marked pinned for the API to serve it.
      const record: JobRecord = {
        ...job,
        isArchived: true,
        expiresAt: null,
        pinnedImageIndices: Array.from(presentIndices).sort((a, b) => a - b),
        imageUnarchiveExpiries: {}
      };
      await writeFile(join(destinationDir, "job.json"), JSON.stringify(record, null, 2), "utf8");

      result.importedJobs += 1;
      result.importedImages += presentIndices.size;
    }
  } finally {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
  }

  return result;
}

