import { copyFile, mkdir, readdir, rm, stat, writeFile, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  JOBS_ARCHIVE_DIR_DEFAULT,
  JOBS_TMP_DIR_DEFAULT,
  JOB_IMAGE_TTL_MS,
  type JobInputs,
  type JobRecord,
} from "../../shared/contracts/jobs.js";
import { formatJobDisplayName } from "../../shared/jobDisplay.js";
import { logServerError } from "./logger.js";

// ─── Directory resolution ─────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function resolveDir(envNew: string, envLegacy: string, defaultVal: string): string {
  return resolve(PROJECT_ROOT, process.env[envNew]?.trim() || process.env[envLegacy]?.trim() || defaultVal);
}

const JOB_TMP_BASE = resolveDir("JOBS_TMP_DIR", "RECENT_JOBS_STORAGE_DIR", JOBS_TMP_DIR_DEFAULT);
const JOB_ARCHIVE_BASE = resolveDir("JOBS_ARCHIVE_DIR", "PINNED_IMAGES_STORAGE_DIR", JOBS_ARCHIVE_DIR_DEFAULT);

// ─── Path helpers ─────────────────────────────────────────────────────────────

export function getJobTmpDir(): string {
  return JOB_TMP_BASE;
}

export function getJobArchiveDir(): string {
  return JOB_ARCHIVE_BASE;
}

export function getJobImagePath(jobId: string, fileName: string, archived = false): string {
  const base = archived ? JOB_ARCHIVE_BASE : JOB_TMP_BASE;
  return join(base, "jobs", jobId, fileName);
}

// ─── Startup ──────────────────────────────────────────────────────────────────

export async function ensureJobStoreDirs(): Promise<void> {
  await mkdir(join(JOB_TMP_BASE, "jobs"), { recursive: true });
  await mkdir(join(JOB_ARCHIVE_BASE, "jobs"), { recursive: true });
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createJob(record: JobRecord, inputs: JobInputs): Promise<void> {
  const jobDir = join(JOB_TMP_BASE, "jobs", record.jobId);
  await mkdir(jobDir, { recursive: true });
  await writeFile(join(jobDir, "job.json"), JSON.stringify(record, null, 2), "utf8");
  await writeFile(join(jobDir, "inputs.json"), JSON.stringify(inputs, null, 2), "utf8");
}

export async function readJob(jobId: string): Promise<JobRecord | null> {
  try {
    const raw = await readFile(join(JOB_TMP_BASE, "jobs", jobId, "job.json"), "utf8");
    return JSON.parse(raw) as JobRecord;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function updateJob(jobId: string, updates: Partial<JobRecord>): Promise<JobRecord | null> {
  const existing = await readJob(jobId);
  if (existing === null) return null;
  const next: JobRecord = { ...existing, ...updates };
  await writeFile(join(JOB_TMP_BASE, "jobs", jobId, "job.json"), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function deleteJob(jobId: string): Promise<void> {
  await rm(join(JOB_TMP_BASE, "jobs", jobId), { recursive: true, force: true });
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listJobs(): Promise<JobRecord[]> {
  let entries: { name: string; isDirectory(): boolean }[];
  try {
    entries = await readdir(join(JOB_TMP_BASE, "jobs"), { withFileTypes: true }) as unknown as { name: string; isDirectory(): boolean }[];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const results = await Promise.all(
    entries.filter((e) => e.isDirectory()).map((e) => readJob(e.name)),
  );

  return (results.filter((r) => r !== null) as JobRecord[]).sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
  );
}

// ─── Archive ──────────────────────────────────────────────────────────────────

export async function archiveJob(jobId: string): Promise<boolean> {
  const srcDir = join(JOB_TMP_BASE, "jobs", jobId);
  const destDir = join(JOB_ARCHIVE_BASE, "jobs", jobId);

  try {
    await stat(srcDir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }

  await mkdir(join(JOB_ARCHIVE_BASE, "jobs"), { recursive: true });
  await mkdir(destDir, { recursive: true });

  const files = await readdir(srcDir);
  await Promise.all(files.map((file) => copyFile(join(srcDir, file), join(destDir, file))));

  // Stamp the archive copy with isArchived: true
  const archiveJobPath = join(destDir, "job.json");
  const raw = await readFile(archiveJobPath, "utf8");
  const archiveRecord = { ...(JSON.parse(raw) as JobRecord), isArchived: true };
  await writeFile(archiveJobPath, JSON.stringify(archiveRecord, null, 2), "utf8");

  // Stamp the tmp dir record so listJobs() reflects isArchived
  await updateJob(jobId, { isArchived: true });

  return true;
}

// ─── Per-image pin / unpin ────────────────────────────────────────────────

const IMAGE_EXTENSIONS = ["png", "jpg", "webp"] as const;

/** Probe srcDir for {displayName}-{index}.{ext} — returns first match or null. */
async function findImageFile(
  srcDir: string,
  displayName: string,
  index: number
): Promise<{ fileName: string; ext: string } | null> {
  for (const ext of IMAGE_EXTENSIONS) {
    const fileName = `${displayName}-${index}.${ext}`;
    try {
      await stat(join(srcDir, fileName));
      return { fileName, ext };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  return null;
}

/**
 * Pin image at imageIndex: copy from tmp → archive, remove from tmp, update job.json.
 * Returns false if job or image file not found.
 */
export async function pinImage(jobId: string, imageIndex: number): Promise<boolean> {
  const job = await readJob(jobId);
  if (!job) return false;

  const tmpDir = join(JOB_TMP_BASE, "jobs", jobId);
  const archiveDir = join(JOB_ARCHIVE_BASE, "jobs", jobId);

  const found = await findImageFile(tmpDir, job.displayName, imageIndex);
  if (!found) return false;

  await mkdir(archiveDir, { recursive: true });
  await copyFile(join(tmpDir, found.fileName), join(archiveDir, found.fileName));
  await rm(join(tmpDir, found.fileName), { force: true });

  const pinnedSet = new Set(job.pinnedImageIndices ?? []);
  pinnedSet.add(imageIndex);

  // Clear any pending unarchive expiry for this index (re-pinned before countdown expired)
  const expiries = { ...(job.imageUnarchiveExpiries ?? {}) };
  delete expiries[String(imageIndex)];

  await updateJob(jobId, {
    pinnedImageIndices: Array.from(pinnedSet),
    imageUnarchiveExpiries: expiries,
  });

  return true;
}

/**
 * Unpin image at imageIndex: copy from archive → tmp, remove from archive,
 * set 1-hour unarchive TTL in job.json.
 */
export async function unpinImage(
  jobId: string,
  imageIndex: number
): Promise<{ ok: true; unarchiveExpiresAt: string } | { ok: false }> {
  const job = await readJob(jobId);
  if (!job) return { ok: false };

  const tmpDir = join(JOB_TMP_BASE, "jobs", jobId);
  const archiveDir = join(JOB_ARCHIVE_BASE, "jobs", jobId);

  const found = await findImageFile(archiveDir, job.displayName, imageIndex);
  if (!found) return { ok: false };

  await copyFile(join(archiveDir, found.fileName), join(tmpDir, found.fileName));
  await rm(join(archiveDir, found.fileName), { force: true });

  const pinnedSet = new Set(job.pinnedImageIndices ?? []);
  pinnedSet.delete(imageIndex);

  const unarchiveExpiresAt = new Date(Date.now() + JOB_IMAGE_TTL_MS).toISOString();
  const expiries = {
    ...(job.imageUnarchiveExpiries ?? {}),
    [String(imageIndex)]: unarchiveExpiresAt,
  };

  await updateJob(jobId, {
    pinnedImageIndices: Array.from(pinnedSet),
    imageUnarchiveExpiries: expiries,
  });

  return { ok: true, unarchiveExpiresAt };
}

// ─── Purge ────────────────────────────────────────────────────────────────────

export async function purgeExpiredJobs(): Promise<string[]> {
  const now = new Date();
  const jobs = await listJobs();
  const toDelete = jobs.filter(
    (r) => r.expiresAt !== null && new Date(r.expiresAt) < now && !r.isArchived
  );

  const deleted: string[] = [];

  await Promise.all(
    toDelete.map(async (record) => {
      try {
        await deleteJob(record.jobId);
        deleted.push(record.jobId);
      } catch (err) {
        logServerError("Failed to purge expired job directory", err, { jobId: record.jobId });
      }
    }),
  );

  // Purge tmp image files for unpinned images whose unarchive countdown has expired (PIN-04)
  const remaining = jobs.filter((r) => !deleted.includes(r.jobId));
  await Promise.all(
    remaining.map(async (record) => {
      if (!record.imageUnarchiveExpiries) return;
      const expiredIndices: number[] = [];
      for (const [indexStr, expiresAt] of Object.entries(record.imageUnarchiveExpiries)) {
        if (expiresAt && new Date(expiresAt) < now) {
          expiredIndices.push(Number(indexStr));
        }
      }
      if (expiredIndices.length === 0) return;

      for (const index of expiredIndices) {
        for (const ext of IMAGE_EXTENSIONS) {
          const filePath = join(JOB_TMP_BASE, "jobs", record.jobId, `${record.displayName}-${index}.${ext}`);
          await rm(filePath, { force: true });
        }
      }

      const updatedExpiries = { ...record.imageUnarchiveExpiries };
      for (const index of expiredIndices) {
        delete updatedExpiries[String(index)];
      }
      await updateJob(record.jobId, { imageUnarchiveExpiries: updatedExpiries });
    })
  );

  return deleted;
}

// Keep formatJobDisplayName importable from this module for convenience
export { formatJobDisplayName };
