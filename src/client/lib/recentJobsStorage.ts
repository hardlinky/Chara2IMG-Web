import Dexie, { type Table } from "dexie";
import {
  RECENT_JOBS_HIDDEN_RETENTION_MS,
  RECENT_JOBS_UNPINNED_LIMIT,
  RECENT_JOBS_VISIBLE_LIMIT,
  type RecentJobRecord,
  type RecentJobSubmissionInput
} from "../../shared/contracts/jobs";
import { extractRunpodOutputImages } from "./runpodOutputImage";

type StoredRecentJob = RecentJobRecord;
type StoredRecentJobArchive = {
  jobId: string;
  lastResponse: Record<string, unknown>;
};
const ACTIVE_JOB_IMAGE_LIMIT = 8;

class RecentJobsDatabase extends Dexie {
  jobs!: Table<StoredRecentJob, string>;
  jobArchives!: Table<StoredRecentJobArchive, string>;

  constructor() {
    super("chara2imgRecentJobs");
    this.version(1).stores({
      jobs: "jobId, submittedAt, hiddenAt, endpointId"
    });
    this.version(2).stores({
      jobs: "jobId, submittedAt, hiddenAt, endpointId",
      jobArchives: "jobId"
    }).upgrade(async (tx) => {
      const jobsTable = tx.table<StoredRecentJob, string>("jobs");
      const archivesTable = tx.table<StoredRecentJobArchive, string>("jobArchives");
      const jobs = await jobsTable.toArray();

      for (const job of jobs) {
        const compacted = compactResponsePayload(job.lastResponse);
        if (!compacted.compactedResponse) {
          continue;
        }

        if (compacted.fullResponse) {
          await archivesTable.put({
            jobId: job.jobId,
            lastResponse: compacted.fullResponse
          });
        }

        await jobsTable.update(job.jobId, {
          lastResponse: compacted.compactedResponse,
          outputImageCount: compacted.totalImageCount
        });
      }
    });
  }
}

const db = new RecentJobsDatabase();
let runningImageCompactionMigration: Promise<void> | null = null;

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

function setValueAtPath(response: Record<string, unknown>, tokens: JsonPathToken[], value: unknown): boolean {
  if (tokens.length === 0) {
    return false;
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

    current[lastToken] = value;
    return true;
  }

  if (!current || typeof current !== "object") {
    return false;
  }

  (current as Record<string, unknown>)[lastToken] = value;
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
  const compacted = compactResponsePayload(input.lastResponse);
  return {
    jobId: input.jobId,
    endpointId: input.endpointId,
    submittedAt: input.submittedAt ?? new Date().toISOString(),
    hiddenAt: null,
    pinnedAt: null,
    pinnedOutputIndices: undefined,
    lifecycle: input.lifecycle,
    provenance: {
      templateFingerprint: input.templateFingerprint,
      workflowFileName: input.workflowFileName,
      draftValues: input.draftValues,
      submittedInput: input.submittedInput
    },
    lastResponse: compacted.compactedResponse,
    outputImageCount: compacted.totalImageCount,
    lastError: input.lastError ?? null
  };
}

function compactResponsePayload(
  response: Record<string, unknown> | null,
  maxImages: number = ACTIVE_JOB_IMAGE_LIMIT
): {
  compactedResponse: Record<string, unknown> | null;
  fullResponse: Record<string, unknown> | null;
  totalImageCount?: number;
} {
  if (!response) {
    return {
      compactedResponse: null,
      fullResponse: null
    };
  }

  const images = extractRunpodOutputImages(response);
  if (images.length === 0) {
    return {
      compactedResponse: response,
      fullResponse: null,
      totalImageCount: 0
    };
  }

  const totalImageCount = images.length;
  const fullResponse = cloneResponseBody(response);
  if (images.length <= maxImages) {
    return {
      compactedResponse: fullResponse,
      fullResponse,
      totalImageCount
    };
  }

  const compactedResponse = cloneResponseBody(response);
  const trailingImages = images.slice(maxImages).reverse();
  for (const image of trailingImages) {
    const tokens = parseSourcePath(image.sourcePath);
    if (!tokens) {
      continue;
    }
    removeImageAtPath(compactedResponse, tokens);
  }

  return {
    compactedResponse,
    fullResponse,
    totalImageCount
  };
}

async function upsertJobArchive(jobId: string, response: Record<string, unknown> | null): Promise<void> {
  if (!response) {
    await db.table<StoredRecentJobArchive, string>("jobArchives").delete(jobId);
    return;
  }

  await db.table<StoredRecentJobArchive, string>("jobArchives").put({
    jobId,
    lastResponse: response
  });
}

async function loadHydratedLastResponse(jobId: string, fallback: Record<string, unknown> | null): Promise<Record<string, unknown> | null> {
  const archived = await db.table<StoredRecentJobArchive, string>("jobArchives").get(jobId);
  return archived?.lastResponse ?? fallback;
}

function shouldCompactJobRecord(job: StoredRecentJob): boolean {
  if (!job.lastResponse) {
    return false;
  }

  const images = extractRunpodOutputImages(job.lastResponse);
  if (images.length > ACTIVE_JOB_IMAGE_LIMIT) {
    return true;
  }

  if (job.outputImageCount === undefined) {
    return true;
  }

  return false;
}

export function startRecentJobsImageCompactionMigration(batchSize: number = 5): Promise<void> {
  if (runningImageCompactionMigration) {
    return runningImageCompactionMigration;
  }

  runningImageCompactionMigration = (async () => {
    let offset = 0;

    while (true) {
      const batch = await db
        .table<StoredRecentJob, string>("jobs")
        .orderBy("submittedAt")
        .offset(offset)
        .limit(batchSize)
        .toArray();

      if (batch.length === 0) {
        break;
      }

      for (const job of batch) {
        if (!shouldCompactJobRecord(job)) {
          continue;
        }

        const hydrated = await loadHydratedLastResponse(job.jobId, job.lastResponse);
        const compacted = compactResponsePayload(hydrated);

        await db.table<StoredRecentJob, string>("jobs").update(job.jobId, {
          lastResponse: compacted.compactedResponse,
          outputImageCount: compacted.totalImageCount
        });

        if (compacted.fullResponse) {
          await upsertJobArchive(job.jobId, compacted.fullResponse);
        }
      }

      offset += batch.length;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }
  })().finally(() => {
    runningImageCompactionMigration = null;
  });

  return runningImageCompactionMigration;
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
  await upsertJobArchive(record.jobId, input.lastResponse);
  await pruneRecentJobs();
  return record;
}

export async function getRecentJob(jobId: string): Promise<RecentJobRecord | null> {
  const job = await db.table<StoredRecentJob, string>("jobs").get(jobId);
  if (!job) {
    return null;
  }

  return {
    ...job,
    lastResponse: await loadHydratedLastResponse(jobId, job.lastResponse)
  };
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

function normalizePinnedOutputIndices(indices: number[] | undefined, removedIndex: number): number[] | undefined {
  if (!indices || indices.length === 0) {
    return undefined;
  }

  const normalized = [...new Set(indices)]
    .filter((index) => index !== removedIndex)
    .map((index) => (index > removedIndex ? index - 1 : index))
    .sort((left, right) => left - right);

  return normalized.length > 0 ? normalized : undefined;
}

function isJobPinned(job: StoredRecentJob): boolean {
  return Boolean(job.pinnedAt) || Boolean(job.pinnedOutputIndices?.length);
}

export async function setRecentJobOutputPinned(
  jobId: string,
  outputIndex: number,
  pinned: boolean,
  pinnedAt: string = new Date().toISOString(),
  replacementDataUrl?: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const target = await db.table<StoredRecentJob, string>("jobs").get(jobId);
  if (!target || target.hiddenAt !== null || outputIndex < 0) {
    return { ok: false, reason: "Job output is not available to pin." };
  }

  if (pinned && replacementDataUrl) {
    const sourceResponse = await loadHydratedLastResponse(jobId, target.lastResponse);
    if (sourceResponse) {
      const extractedImages = extractRunpodOutputImages(sourceResponse);
      const replacementTarget = extractedImages[outputIndex];

      if (replacementTarget) {
        const tokens = parseSourcePath(replacementTarget.sourcePath);
        if (tokens) {
          const clonedResponse = cloneResponseBody(sourceResponse);
          const replaced = setValueAtPath(clonedResponse, tokens, replacementDataUrl);

          if (replaced) {
            const compacted = compactResponsePayload(clonedResponse);
            await db.table<StoredRecentJob, string>("jobs").update(jobId, {
              lastResponse: compacted.compactedResponse,
              outputImageCount: compacted.totalImageCount
            });
            await upsertJobArchive(jobId, compacted.fullResponse);
          }
        }
      }
    }
  }

  const currentPinnedIndices = new Set(target.pinnedOutputIndices ?? []);
  const currentlyPinned = currentPinnedIndices.has(outputIndex);
  if (pinned === currentlyPinned) {
    return { ok: true };
  }

  if (pinned) {
    currentPinnedIndices.add(outputIndex);
  } else {
    currentPinnedIndices.delete(outputIndex);
  }

  const nextPinnedOutputIndices = [...currentPinnedIndices].sort((left, right) => left - right);
  await db.table<StoredRecentJob, string>("jobs").update(jobId, {
    pinnedOutputIndices: nextPinnedOutputIndices.length > 0 ? nextPinnedOutputIndices : undefined,
    pinnedAt: nextPinnedOutputIndices.length > 0 ? target.pinnedAt ?? pinnedAt : null
  });

  return { ok: true };
}

export async function toggleRecentJobOutputPinned(jobId: string, outputIndex: number, pinned: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
  return setRecentJobOutputPinned(jobId, outputIndex, pinned);
}

export async function removeRecentJobOutputImage(jobId: string, outputIndex: number): Promise<void> {
  const job = await db.table<StoredRecentJob, string>("jobs").get(jobId);
  if (!job || outputIndex < 0) {
    return;
  }

  const sourceResponse = await loadHydratedLastResponse(jobId, job.lastResponse);
  if (!sourceResponse) {
    return;
  }

  const extractedImages = extractRunpodOutputImages(sourceResponse);
  const targetImage = extractedImages[outputIndex];
  if (!targetImage) {
    return;
  }

  const tokens = parseSourcePath(targetImage.sourcePath);
  if (!tokens) {
    return;
  }

  const clonedResponse = cloneResponseBody(sourceResponse);
  const removed = removeImageAtPath(clonedResponse, tokens);
  if (!removed) {
    return;
  }

  const remainingImages = extractRunpodOutputImages(clonedResponse);
  const noImagesRemain = remainingImages.length === 0;
  const hiddenAt = noImagesRemain ? new Date().toISOString() : job.hiddenAt;

  const compacted = compactResponsePayload(clonedResponse);

  await db.table<StoredRecentJob, string>("jobs").update(jobId, {
    lastResponse: compacted.compactedResponse,
    outputImageCount: compacted.totalImageCount,
    hiddenOutputIndices: normalizeHiddenOutputIndices(job.hiddenOutputIndices, outputIndex),
    pinnedOutputIndices: normalizePinnedOutputIndices(job.pinnedOutputIndices, outputIndex),
    pinnedAt: normalizePinnedOutputIndices(job.pinnedOutputIndices, outputIndex)?.length ? job.pinnedAt ?? new Date().toISOString() : null,
    outputsHidden: noImagesRemain ? true : job.outputsHidden,
    hiddenAt
  });

  if (noImagesRemain) {
    await upsertJobArchive(jobId, null);
  } else {
    await upsertJobArchive(jobId, compacted.fullResponse);
  }

  if (noImagesRemain) {
    await pruneRecentJobs();
  }
}

export async function hideJobOutputs(jobId: string): Promise<void> {
  await db.table<StoredRecentJob, string>("jobs").update(jobId, {
    outputsHidden: true,
    hiddenAt: new Date().toISOString()
  });
  await upsertJobArchive(jobId, null);
  await pruneRecentJobs();
}

export async function pruneRecentJobs(now: number = Date.now()): Promise<void> {
  const jobs = await collectJobs();
  const hiddenCutoff = now - RECENT_JOBS_HIDDEN_RETENTION_MS;
  const hiddenExpired = jobs.filter((job) => job.hiddenAt !== null && Date.parse(job.hiddenAt) < hiddenCutoff);
  const remainingAfterHiddenExpiry = jobs.filter((job) => !hiddenExpired.includes(job));

  const toDelete = new Set<string>(hiddenExpired.map((job) => job.jobId));
  const visibleJobs = remainingAfterHiddenExpiry.filter((job) => job.hiddenAt === null);
  const unpinnedVisibleJobs = visibleJobs.filter((job) => !isJobPinned(job));

  const unpinnedExcess = unpinnedVisibleJobs.length - RECENT_JOBS_UNPINNED_LIMIT;
  if (unpinnedExcess > 0) {
    const candidates = unpinnedVisibleJobs.sort(sortNewestFirst).slice(RECENT_JOBS_UNPINNED_LIMIT);
    for (const job of candidates) {
      toDelete.add(job.jobId);
    }
  }

  if (toDelete.size > 0) {
    await db.table<StoredRecentJob, string>("jobs").bulkDelete([...toDelete]);
    await db.table<StoredRecentJobArchive, string>("jobArchives").bulkDelete([...toDelete]);
  }
}

export async function clearRecentJobs(): Promise<void> {
  await db.table<StoredRecentJob, string>("jobs").clear();
  await db.table<StoredRecentJobArchive, string>("jobArchives").clear();
}

export async function estimateRecentJobsStoredBytes(): Promise<number> {
  const [jobs, archives] = await Promise.all([
    db.table<StoredRecentJob, string>("jobs").toArray(),
    db.table<StoredRecentJobArchive, string>("jobArchives").toArray()
  ]);

  const jobsBytes = JSON.stringify(jobs).length;
  const archivesBytes = JSON.stringify(archives).length;
  return jobsBytes + archivesBytes;
}

export async function updateRecentJobLifecycle(
  jobId: string,
  lifecycle: StoredRecentJob["lifecycle"],
  lastResponse: StoredRecentJob["lastResponse"] = null,
  lastError: StoredRecentJob["lastError"] = null
): Promise<void> {
  const compacted = compactResponsePayload(lastResponse);

  await db.table<StoredRecentJob, string>("jobs").update(jobId, {
    lifecycle,
    lastResponse: compacted.compactedResponse,
    outputImageCount: compacted.totalImageCount,
    lastError
  });

  if (compacted.fullResponse) {
    await upsertJobArchive(jobId, compacted.fullResponse);
  }
}