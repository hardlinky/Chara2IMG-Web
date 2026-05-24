import Dexie, { type Table } from "dexie";
import {
  RECENT_JOBS_HIDDEN_RETENTION_MS,
  RECENT_JOBS_TOTAL_LIMIT,
  RECENT_JOBS_VISIBLE_LIMIT,
  type RecentJobRecord,
  type RecentJobSubmissionInput
} from "../../shared/contracts/jobs";

type StoredRecentJob = RecentJobRecord;

class RecentJobsDatabase extends Dexie {
  jobs!: Table<StoredRecentJob, string>;

  constructor() {
    super("chara2imgRecentJobs");
    this.version(1).stores({
      jobs: "jobId, submittedAt, hiddenAt, endpointId"
    });
  }
}

const db = new RecentJobsDatabase();

function normalizeJobRecord(input: RecentJobSubmissionInput): StoredRecentJob {
  return {
    jobId: input.jobId,
    endpointId: input.endpointId,
    submittedAt: input.submittedAt ?? new Date().toISOString(),
    hiddenAt: null,
    lifecycle: input.lifecycle,
    provenance: {
      templateFingerprint: input.templateFingerprint,
      workflowFileName: input.workflowFileName,
      draftValues: input.draftValues,
      submittedInput: input.submittedInput
    },
    lastResponse: input.lastResponse,
    lastError: input.lastError ?? null
  };
}

function sortNewestFirst(left: StoredRecentJob, right: StoredRecentJob): number {
  return right.submittedAt.localeCompare(left.submittedAt);
}

async function collectJobs(): Promise<StoredRecentJob[]> {
  return db.table<StoredRecentJob, string>("jobs").toArray();
}

export async function upsertRecentJob(input: RecentJobSubmissionInput): Promise<RecentJobRecord> {
  const record = normalizeJobRecord(input);
  await db.table<StoredRecentJob, string>("jobs").put(record);
  await pruneRecentJobs();
  return record;
}

export async function getRecentJob(jobId: string): Promise<RecentJobRecord | null> {
  return (await db.table<StoredRecentJob, string>("jobs").get(jobId)) ?? null;
}

export async function listRecentJobs(): Promise<RecentJobRecord[]> {
  const jobs = await collectJobs();
  return jobs.sort(sortNewestFirst);
}

export async function listVisibleRecentJobs(): Promise<RecentJobRecord[]> {
  const jobs = await collectJobs();
  return jobs.filter((job) => job.hiddenAt === null).sort(sortNewestFirst).slice(0, RECENT_JOBS_VISIBLE_LIMIT);
}

export async function hideRecentJob(jobId: string, hiddenAt: string = new Date().toISOString()): Promise<void> {
  await db.table<StoredRecentJob, string>("jobs").update(jobId, { hiddenAt });
  await pruneRecentJobs();
}

export async function updateRecentJobLifecycle(
  jobId: string,
  lifecycle: StoredRecentJob["lifecycle"],
  lastResponse: StoredRecentJob["lastResponse"] = null,
  lastError: StoredRecentJob["lastError"] = null
): Promise<void> {
  await db.table<StoredRecentJob, string>("jobs").update(jobId, {
    lifecycle,
    lastResponse,
    lastError
  });
}

export async function pruneRecentJobs(now: number = Date.now()): Promise<void> {
  const jobs = await collectJobs();
  const hiddenCutoff = now - RECENT_JOBS_HIDDEN_RETENTION_MS;
  const hiddenExpired = jobs.filter((job) => job.hiddenAt !== null && Date.parse(job.hiddenAt) < hiddenCutoff);
  const remainingAfterHiddenExpiry = jobs.filter((job) => !hiddenExpired.includes(job));

  const ordered = [...remainingAfterHiddenExpiry].sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
  const excess = ordered.length - RECENT_JOBS_TOTAL_LIMIT;

  const toDelete = new Set<string>(hiddenExpired.map((job) => job.jobId));
  if (excess > 0) {
    const visibleOldestFirst = ordered.filter((job) => job.hiddenAt !== null);
    const visibleFallback = ordered.filter((job) => job.hiddenAt === null);
    const deletions = [...visibleOldestFirst, ...visibleFallback].slice(0, excess);
    for (const job of deletions) {
      toDelete.add(job.jobId);
    }
  }

  if (toDelete.size > 0) {
    await db.table<StoredRecentJob, string>("jobs").bulkDelete([...toDelete]);
  }
}

export async function clearRecentJobs(): Promise<void> {
  await db.table<StoredRecentJob, string>("jobs").clear();
}