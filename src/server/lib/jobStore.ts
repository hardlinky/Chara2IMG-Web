import { copyFile, mkdir, readdir, rm, stat, writeFile, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  JOBS_ARCHIVE_DIR_DEFAULT,
  JOBS_TMP_DIR_DEFAULT,
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

  return deleted;
}

// Keep formatJobDisplayName importable from this module for convenience
export { formatJobDisplayName };
