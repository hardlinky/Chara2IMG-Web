import Dexie, { type Table } from "dexie";
import {
  RECENT_JOBS_HIDDEN_RETENTION_MS,
  RECENT_JOBS_TOTAL_LIMIT,
  RECENT_JOBS_VISIBLE_LIMIT,
  type RecentJobRecord,
  type RecentJobSubmissionInput
} from "../../shared/contracts/jobs";
import { extractRunpodOutputImages } from "./runpodOutputImage";

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

type JsonPathToken = string | number;

function parseSourcePath(sourcePath: string): JsonPathToken[] | null {
  if (!sourcePath.startsWith("$")) {
    return null;
  }

  const tokens: JsonPathToken[] = [];
  let cursor = 1;

  while (cursor < sourcePath.length) {
    const char = sourcePath[cursor];

    if (char === ".") {
      const start = cursor + 1;
      let end = start;
      while (end < sourcePath.length && sourcePath[end] !== "." && sourcePath[end] !== "[") {
        end += 1;
      }
      if (end <= start) {
        return null;
      }
      tokens.push(sourcePath.slice(start, end));
      cursor = end;
      continue;
    }

    if (char === "[") {
      const close = sourcePath.indexOf("]", cursor);
      if (close === -1) {
        return null;
      }
      const rawIndex = sourcePath.slice(cursor + 1, close);
      if (!/^\d+$/.test(rawIndex)) {
        return null;
      }
      tokens.push(Number(rawIndex));
      cursor = close + 1;
      continue;
    }

    return null;
  }

  return tokens;
}

function cloneResponseBody(response: Record<string, unknown>): Record<string, unknown> {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(response) as Record<string, unknown>;
  }

  return JSON.parse(JSON.stringify(response)) as Record<string, unknown>;
}

function removeImageAtPath(response: Record<string, unknown>, tokens: JsonPathToken[]): boolean {
  if (tokens.length === 0) {
    return false;
  }

  const removeArrayElementIfAddressable = (): boolean => {
    if (tokens.length < 2 || typeof tokens[tokens.length - 1] !== "string" || typeof tokens[tokens.length - 2] !== "number") {
      return false;
    }

    let current: unknown = response;
    for (let index = 0; index < tokens.length - 2; index += 1) {
      const token = tokens[index];
      if (typeof token === "number") {
        if (!Array.isArray(current) || token < 0 || token >= current.length) {
          return false;
        }
        current = current[token];
        continue;
      }

      if (!current || typeof current !== "object" || !(token in (current as Record<string, unknown>))) {
        return false;
      }
      current = (current as Record<string, unknown>)[token];
    }

    const itemIndexToken = tokens[tokens.length - 2];
    if (typeof itemIndexToken !== "number") {
      return false;
    }

    const itemIndex = itemIndexToken;
    if (!Array.isArray(current) || itemIndex < 0 || itemIndex >= current.length) {
      return false;
    }

    current.splice(itemIndex, 1);
    return true;
  };

  if (removeArrayElementIfAddressable()) {
    return true;
  }

  let current: unknown = response;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];

    if (typeof token === "number") {
      if (!Array.isArray(current) || token < 0 || token >= current.length) {
        return false;
      }
      current = current[token];
      continue;
    }

    if (!current || typeof current !== "object" || !(token in (current as Record<string, unknown>))) {
      return false;
    }
    current = (current as Record<string, unknown>)[token];
  }

  const lastToken = tokens[tokens.length - 1];
  if (typeof lastToken === "number") {
    if (!Array.isArray(current) || lastToken < 0 || lastToken >= current.length) {
      return false;
    }
    current.splice(lastToken, 1);
    return true;
  }

  if (!current || typeof current !== "object" || !(lastToken in (current as Record<string, unknown>))) {
    return false;
  }

  (current as Record<string, unknown>)[lastToken] = null;
  return true;
}

function normalizeHiddenOutputIndices(indices: number[] | undefined, removedIndex: number): number[] | undefined {
  if (!indices || indices.length === 0) {
    return undefined;
  }

  const normalized = [...new Set(indices)]
    .filter((index) => index !== removedIndex)
    .map((index) => (index > removedIndex ? index - 1 : index))
    .sort((left, right) => left - right);

  return normalized.length > 0 ? normalized : undefined;
}

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

export async function hideJobOutputImage(jobId: string, outputIndex: number): Promise<void> {
  const job = await db.table<StoredRecentJob, string>("jobs").get(jobId);
  if (!job || !job.lastResponse || outputIndex < 0) {
    return;
  }

  const extractedImages = extractRunpodOutputImages(job.lastResponse);
  const targetImage = extractedImages[outputIndex];
  if (!targetImage) {
    return;
  }

  const tokens = parseSourcePath(targetImage.sourcePath);
  if (!tokens) {
    return;
  }

  const clonedResponse = cloneResponseBody(job.lastResponse);
  const removed = removeImageAtPath(clonedResponse, tokens);
  if (!removed) {
    return;
  }

  await db.table<StoredRecentJob, string>("jobs").update(jobId, {
    lastResponse: clonedResponse,
    hiddenOutputIndices: normalizeHiddenOutputIndices(job.hiddenOutputIndices, outputIndex)
  });
}

export async function hideJobOutputs(jobId: string): Promise<void> {
  await db.table<StoredRecentJob, string>("jobs").update(jobId, { outputsHidden: true });
}

export async function clearRecentJobs(): Promise<void> {
  await db.table<StoredRecentJob, string>("jobs").clear();
}