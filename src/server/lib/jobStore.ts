import { copyFile, mkdir, readdir, rm, stat, writeFile, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  JOBS_ARCHIVE_DIR_DEFAULT,
  JOBS_TMP_DIR_DEFAULT,
  JOB_IMAGE_TTL_MS,
  type JobImageRecord,
  type JobInputs,
  type JobManifestEntry,
  type JobOutputImageMimeType,
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

// ─── Manifest enumeration + single-image purge ─────────────────────────────

const MIME_BY_EXT: Record<(typeof IMAGE_EXTENSIONS)[number], JobOutputImageMimeType> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

/** Read the archive copy of a job.json (ENOENT → null). */
async function readArchiveJob(jobId: string): Promise<JobRecord | null> {
  try {
    const raw = await readFile(join(JOB_ARCHIVE_BASE, "jobs", jobId, "job.json"), "utf8");
    return JSON.parse(raw) as JobRecord;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** List jobIds present under {base}/jobs (ENOENT → []). */
async function listJobIdsIn(base: string): Promise<string[]> {
  try {
    const entries = (await readdir(join(base, "jobs"), { withFileTypes: true })) as unknown as {
      name: string;
      isDirectory(): boolean;
    }[];
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** Parse a `{displayName}-{index}.{ext}` filename → { index, ext } or null. */
function parseImageFileName(
  fileName: string,
  displayName: string
): { index: number; ext: (typeof IMAGE_EXTENSIONS)[number] } | null {
  const prefix = `${displayName}-`;
  for (const ext of IMAGE_EXTENSIONS) {
    const suffix = `.${ext}`;
    if (!fileName.startsWith(prefix) || !fileName.endsWith(suffix)) continue;
    const indexStr = fileName.slice(prefix.length, fileName.length - suffix.length);
    if (!/^\d+$/.test(indexStr)) continue;
    return { index: Number.parseInt(indexStr, 10), ext };
  }
  return null;
}

/**
 * Enumerate every known job (tmp ∪ archive) as a per-image manifest entry.
 * Scans both tmp and archive dirs; if an index exists in both, the archive
 * (pinned) copy wins and a single record is emitted.
 */
export async function listManifestImages(): Promise<JobManifestEntry[]> {
  const tmpIds = await listJobIdsIn(JOB_TMP_BASE);
  const archiveIds = await listJobIdsIn(JOB_ARCHIVE_BASE);
  const jobIds = Array.from(new Set([...tmpIds, ...archiveIds]));

  const entries = await Promise.all(
    jobIds.map(async (jobId): Promise<JobManifestEntry | null> => {
      const job = (await readJob(jobId)) ?? (await readArchiveJob(jobId));
      if (!job) return null;

      const byIndex = new Map<number, JobImageRecord>();

      const scan = async (base: string, archived: boolean): Promise<void> => {
        const dir = join(base, "jobs", jobId);
        let files: string[];
        try {
          files = await readdir(dir);
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
          throw err;
        }
        for (const fileName of files) {
          const parsed = parseImageFileName(fileName, job.displayName);
          if (!parsed) continue;
          // Archive scanned first; tmp does not overwrite an existing archive record.
          if (byIndex.has(parsed.index)) continue;
          const filePath = join(dir, fileName);
          const fileStat = await stat(filePath);
          byIndex.set(parsed.index, {
            jobId,
            imageIndex: parsed.index,
            fileName,
            relPath: `jobs/${jobId}/${fileName}`,
            mimeType: MIME_BY_EXT[parsed.ext],
            sizeBytes: fileStat.size,
            isPinned: job.pinnedImageIndices?.includes(parsed.index) ?? false,
            isArchived: archived,
            archivedAt: null,
            unarchiveExpiresAt: job.imageUnarchiveExpiries?.[String(parsed.index)] ?? null,
          });
        }
      };

      await scan(JOB_ARCHIVE_BASE, true);
      await scan(JOB_TMP_BASE, false);

      const images = Array.from(byIndex.values()).sort((a, b) => a.imageIndex - b.imageIndex);

      return {
        jobId: job.jobId,
        displayName: job.displayName,
        endpointId: job.endpointId,
        workflowFileName: job.workflowFileName,
        submittedAt: job.submittedAt,
        completedAt: job.completedAt,
        expiresAt: job.expiresAt,
        status: job.status,
        isTerminal: job.isTerminal,
        imageCount: job.imageCount,
        images,
      };
    })
  );

  return (entries.filter((e) => e !== null) as JobManifestEntry[]).sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );
}

/**
 * Returns true if any image file (png/jpg/webp) exists in `dir` for the given displayName.
 */
async function dirHasImages(dir: string, displayName: string): Promise<boolean> {
  for (const ext of IMAGE_EXTENSIONS) {
    // Check any index 0–999 by listing and matching
    try {
      const entries = await readdir(dir);
      if (entries.some((f) => f.startsWith(`${displayName}-`) && f.endsWith(`.${ext}`))) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Purge a single image (by stable index) from BOTH tmp and archive dirs and
 * clean its pin/expiry state from job.json in whichever dir(s) it exists.
 * Returns true if at least one image file was removed.
 */
export async function deleteJobImage(jobId: string, imageIndex: number): Promise<boolean> {
  const job = (await readJob(jobId)) ?? (await readArchiveJob(jobId));
  if (!job) return false;

  const tmpDir = join(JOB_TMP_BASE, "jobs", jobId);
  const archiveDir = join(JOB_ARCHIVE_BASE, "jobs", jobId);
  const dirs = [tmpDir, archiveDir];

  let removed = false;
  for (const dir of dirs) {
    for (const ext of IMAGE_EXTENSIONS) {
      const filePath = join(dir, `${job.displayName}-${imageIndex}.${ext}`);
      try {
        await stat(filePath);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        continue;
      }
      await rm(filePath, { force: true });
      removed = true;
    }
  }

  // Clean tmp job.json pin/expiry state (if a tmp record exists).
  const tmpJob = await readJob(jobId);
  if (tmpJob) {
    const pinnedImageIndices = (tmpJob.pinnedImageIndices ?? []).filter((i) => i !== imageIndex);
    const imageUnarchiveExpiries = { ...(tmpJob.imageUnarchiveExpiries ?? {}) };
    delete imageUnarchiveExpiries[String(imageIndex)];
    const deletedImageIndices = Array.from(new Set([...(tmpJob.deletedImageIndices ?? []), imageIndex]));
    await updateJob(jobId, { pinnedImageIndices, imageUnarchiveExpiries, deletedImageIndices });

    // If no image files remain in tmp dir AND no pinned images in archive,
    // remove the whole tmp job folder. If archive still has pinned images,
    // keep tmp so the job stays visible in listJobs (which reads from tmp).
    const hasRemainingTmpImages = await dirHasImages(tmpDir, job.displayName);
    const hasRemainingArchiveImages = await dirHasImages(archiveDir, job.displayName);
    if (!hasRemainingTmpImages && !hasRemainingArchiveImages) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }

  // Clean archive job.json pin/expiry state directly (if an archive record exists).
  const archiveJobPath = join(archiveDir, "job.json");
  try {
    const raw = await readFile(archiveJobPath, "utf8");
    const archiveRecord = JSON.parse(raw) as JobRecord;
    const pinnedImageIndices = (archiveRecord.pinnedImageIndices ?? []).filter((i) => i !== imageIndex);
    const imageUnarchiveExpiries = { ...(archiveRecord.imageUnarchiveExpiries ?? {}) };
    delete imageUnarchiveExpiries[String(imageIndex)];
    const next: JobRecord = { ...archiveRecord, pinnedImageIndices, imageUnarchiveExpiries };

    // If no image files remain in archive dir, remove the whole archive job folder.
    const hasRemainingArchiveImages = await dirHasImages(archiveDir, job.displayName);
    if (!hasRemainingArchiveImages) {
      await rm(archiveDir, { recursive: true, force: true });
    } else {
      await writeFile(archiveJobPath, JSON.stringify(next, null, 2), "utf8");
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  return removed;
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
