import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { ANONYMOUS_ARCHIVE_OWNER, type UserArchiveSummary } from "../../shared/contracts/archives.js";
import type { JobRecord } from "../../shared/contracts/jobs.js";
import { getJobArchiveDir, getJobTmpDir, readJobAnywhere } from "./jobStore.js";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".webp"];

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
