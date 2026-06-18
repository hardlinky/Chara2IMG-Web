import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RECENT_JOBS_HIDDEN_RETENTION_MS,
  RECENT_JOBS_UNPINNED_LIMIT,
  RECENT_JOBS_VISIBLE_LIMIT,
  type RecentJobRecord,
  type RecentJobSubmissionInput
} from "../../shared/contracts/jobs";
import { extractRunpodOutputImages } from "../../client/lib/runpodOutputImage";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(CURRENT_DIR, "../../..");
const RECENT_JOBS_DIR = (() => {
  const configured = process.env.RECENT_JOBS_STORAGE_DIR?.trim();
  if (configured) {
    return resolve(PROJECT_ROOT, configured);
  }

  return resolve(PROJECT_ROOT, "../chara2img/recent-jobs");
})();

const LIVE_STORE_FILE = resolve(RECENT_JOBS_DIR, "recent-jobs.v1.json");
const LEGACY_ARCHIVE_FILE = resolve(RECENT_JOBS_DIR, "recent-jobs-archive.v1.json");
const ACTIVE_JOB_IMAGE_LIMIT = 8;

type StoredRecentJob = RecentJobRecord;
type StoredRecentJobArchive = {
  jobId: string;
  lastResponse: Record<string, unknown>;
};

type RecentJobsStoreFile = {
  version: 1;
  jobs: StoredRecentJob[];
  archives: StoredRecentJobArchive[];
};

function emptyStore(): RecentJobsStoreFile {
  return {
    version: 1,
    jobs: [],
    archives: []
  };
}

type JsonPathToken = string | number;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeFiniteBytes(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0;
}

function sanitizeWorkflowFileName(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "workflow";
}

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

    if (!isObject(current) || !(token in current)) {
      return false;
    }
    current = current[token];
  }

  const lastToken = tokens[tokens.length - 1];
  if (typeof lastToken === "number") {
    if (!Array.isArray(current) || lastToken < 0 || lastToken >= current.length) {
      return false;
    }
    current.splice(lastToken, 1);
    return true;
  }

  if (!isObject(current) || !(lastToken in current)) {
    return false;
  }

  current[lastToken] = null;
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

    if (!isObject(current) || !(token in current)) {
      return false;
    }
    current = current[token];
  }

  const lastToken = tokens[tokens.length - 1];
  if (typeof lastToken === "number") {
    if (!Array.isArray(current) || lastToken < 0 || lastToken >= current.length) {
      return false;
    }
    current[lastToken] = value;
    return true;
  }

  if (!isObject(current)) {
    return false;
  }

  current[lastToken] = value;
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

function sortNewestFirst(left: StoredRecentJob, right: StoredRecentJob): number {
  return right.submittedAt.localeCompare(left.submittedAt);
}

function isJobPinned(job: StoredRecentJob): boolean {
  return Boolean(job.pinnedAt) || Boolean(job.pinnedOutputIndices?.length);
}

function dedupeByJobId(items: StoredRecentJob[]): StoredRecentJob[] {
  const byJobId = new Map<string, StoredRecentJob>();
  for (const item of items) {
    byJobId.set(item.jobId, item);
  }

  return [...byJobId.values()];
}

function dedupeArchives(items: StoredRecentJobArchive[]): StoredRecentJobArchive[] {
  const byJobId = new Map<string, StoredRecentJobArchive>();
  for (const item of items) {
    byJobId.set(item.jobId, item);
  }

  return [...byJobId.values()];
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
    return { compactedResponse: null, fullResponse: null };
  }

  const images = extractRunpodOutputImages(response);
  if (images.length === 0) {
    return { compactedResponse: response, fullResponse: null, totalImageCount: 0 };
  }

  const totalImageCount = images.length;
  const fullResponse = cloneResponseBody(response);
  if (images.length <= maxImages) {
    return { compactedResponse: fullResponse, fullResponse, totalImageCount };
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

async function readStore(): Promise<RecentJobsStoreFile> {
  try {
    await mkdir(RECENT_JOBS_DIR, { recursive: true });
    const raw = await readFile(LIVE_STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<RecentJobsStoreFile>;

    if (parsed.version !== 1 || !Array.isArray(parsed.jobs)) {
      return emptyStore();
    }

    return {
      version: 1,
      jobs: parsed.jobs.filter((value): value is StoredRecentJob => Boolean(value) && typeof value === "object" && typeof (value as { jobId?: unknown }).jobId === "string"),
      archives: Array.isArray(parsed.archives)
        ? parsed.archives.filter((value): value is StoredRecentJobArchive => Boolean(value) && typeof value === "object" && typeof (value as { jobId?: unknown }).jobId === "string" && isObject((value as { lastResponse?: unknown }).lastResponse))
        : []
    };
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: RecentJobsStoreFile): Promise<void> {
  await mkdir(RECENT_JOBS_DIR, { recursive: true });
  await writeFile(LIVE_STORE_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function updateStore(mutator: (store: RecentJobsStoreFile) => void | Promise<void>): Promise<void> {
  const store = await readStore();
  await mutator(store);
  store.jobs = dedupeByJobId(store.jobs);
  store.archives = dedupeArchives(store.archives);
  await writeStore(store);
}

async function loadHydratedLastResponse(store: RecentJobsStoreFile, jobId: string, fallback: Record<string, unknown> | null): Promise<Record<string, unknown> | null> {
  const archived = store.archives.find((entry) => entry.jobId === jobId);
  return archived?.lastResponse ?? fallback;
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

async function upsertJobArchive(store: RecentJobsStoreFile, jobId: string, response: Record<string, unknown> | null): Promise<void> {
  const index = store.archives.findIndex((entry) => entry.jobId === jobId);
  if (!response) {
    if (index >= 0) {
      store.archives.splice(index, 1);
    }
    return;
  }

  const record: StoredRecentJobArchive = { jobId, lastResponse: response };
  if (index >= 0) {
    store.archives[index] = record;
    return;
  }

  store.archives.push(record);
}

function isTerminalJob(job: StoredRecentJob): boolean {
  return Boolean(job.lifecycle.isTerminal);
}

async function ensureCleanedStore(): Promise<RecentJobsStoreFile> {
  const store = await readStore();
  return store;
}

export async function startRecentJobsImageCompactionMigration(): Promise<void> {
  const store = await readStore();
  let changed = false;

  for (let index = 0; index < store.jobs.length; index += 1) {
    const job = store.jobs[index]!;
    if (!job.lastResponse) {
      continue;
    }

    const images = extractRunpodOutputImages(job.lastResponse);
    if (images.length <= ACTIVE_JOB_IMAGE_LIMIT && job.outputImageCount !== undefined) {
      continue;
    }

    const hydrated = await loadHydratedLastResponse(store, job.jobId, job.lastResponse);
    const compacted = compactResponsePayload(hydrated);
    store.jobs[index] = {
      ...job,
      lastResponse: compacted.compactedResponse,
      outputImageCount: compacted.totalImageCount
    };
    await upsertJobArchive(store, job.jobId, compacted.fullResponse);
    changed = true;
  }

  if (changed) {
    await writeStore(store);
  }
}

export async function upsertRecentJob(input: RecentJobSubmissionInput): Promise<RecentJobRecord> {
  const store = await readStore();
  const record = normalizeJobRecord(input);
  const existingIndex = store.jobs.findIndex((job) => job.jobId === record.jobId);

  if (existingIndex >= 0) {
    store.jobs[existingIndex] = record;
  } else {
    store.jobs.push(record);
  }

  await upsertJobArchive(store, record.jobId, input.lastResponse);
  await pruneRecentJobs(store);
  await writeStore(store);
  return record;
}

export async function getRecentJob(jobId: string): Promise<RecentJobRecord | null> {
  const store = await readStore();
  const job = store.jobs.find((entry) => entry.jobId === jobId);
  if (!job) {
    return null;
  }

  return {
    ...job,
    lastResponse: await loadHydratedLastResponse(store, jobId, job.lastResponse)
  };
}

export async function listRecentJobs(): Promise<RecentJobRecord[]> {
  const store = await readStore();
  return [...store.jobs].sort(sortNewestFirst);
}

export async function listVisibleRecentJobs(): Promise<RecentJobRecord[]> {
  const store = await readStore();
  return [...store.jobs].filter((job) => job.hiddenAt === null).sort(sortNewestFirst).slice(0, RECENT_JOBS_VISIBLE_LIMIT);
}

export async function hideRecentJob(jobId: string, hiddenAt: string = new Date().toISOString()): Promise<void> {
  await updateStore((store) => {
    const job = store.jobs.find((entry) => entry.jobId === jobId);
    if (job) {
      job.hiddenAt = hiddenAt;
    }
  });
  const store = await readStore();
  await pruneRecentJobs(store);
  await writeStore(store);
}

export async function deleteRecentJob(jobId: string): Promise<void> {
  await updateStore((store) => {
    store.jobs = store.jobs.filter((job) => job.jobId !== jobId);
    store.archives = store.archives.filter((archive) => archive.jobId !== jobId);
  });
}

export async function setRecentJobOutputPinned(
  jobId: string,
  outputIndex: number,
  pinned: boolean,
  pinnedAt: string = new Date().toISOString(),
  replacementDataUrl?: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const store = await readStore();
  const target = store.jobs.find((entry) => entry.jobId === jobId);
  if (!target || target.hiddenAt !== null || outputIndex < 0) {
    return { ok: false, reason: "Job output is not available to pin." };
  }

  if (pinned && replacementDataUrl) {
    const sourceResponse = await loadHydratedLastResponse(store, jobId, target.lastResponse);
    if (sourceResponse) {
      const extractedImages = extractRunpodOutputImages(sourceResponse);
      const replacementTarget = extractedImages[outputIndex];
      if (replacementTarget) {
        const tokens = parseSourcePath(replacementTarget.sourcePath);
        if (tokens) {
          const clonedResponse = cloneResponseBody(sourceResponse);
          if (setValueAtPath(clonedResponse, tokens, replacementDataUrl)) {
            const compacted = compactResponsePayload(clonedResponse);
            target.lastResponse = compacted.compactedResponse;
            target.outputImageCount = compacted.totalImageCount;
            await upsertJobArchive(store, jobId, compacted.fullResponse);
          }
        }
      }
    }
  }

  const currentPinnedIndices = new Set(target.pinnedOutputIndices ?? []);
  const currentlyPinned = currentPinnedIndices.has(outputIndex);
  if (pinned === currentlyPinned) {
    await writeStore(store);
    return { ok: true };
  }

  if (pinned) {
    currentPinnedIndices.add(outputIndex);
  } else {
    currentPinnedIndices.delete(outputIndex);
  }

  const nextPinnedOutputIndices = [...currentPinnedIndices].sort((left, right) => left - right);
  target.pinnedOutputIndices = nextPinnedOutputIndices.length > 0 ? nextPinnedOutputIndices : undefined;
  target.pinnedAt = nextPinnedOutputIndices.length > 0 ? target.pinnedAt ?? pinnedAt : null;
  await writeStore(store);
  return { ok: true };
}

export async function toggleRecentJobOutputPinned(jobId: string, outputIndex: number, pinned: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
  return setRecentJobOutputPinned(jobId, outputIndex, pinned);
}

export async function removeRecentJobOutputImage(jobId: string, outputIndex: number): Promise<void> {
  const store = await readStore();
  const job = store.jobs.find((entry) => entry.jobId === jobId);
  if (!job || outputIndex < 0) {
    return;
  }

  const sourceResponse = await loadHydratedLastResponse(store, jobId, job.lastResponse);
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
  if (remainingImages.length === 0) {
    store.jobs = store.jobs.filter((entry) => entry.jobId !== jobId);
    store.archives = store.archives.filter((entry) => entry.jobId !== jobId);
    await writeStore(store);
    return;
  }

  const compacted = compactResponsePayload(clonedResponse);
  job.lastResponse = compacted.compactedResponse;
  job.outputImageCount = compacted.totalImageCount;
  job.hiddenOutputIndices = normalizeHiddenOutputIndices(job.hiddenOutputIndices, outputIndex);
  job.pinnedOutputIndices = normalizePinnedOutputIndices(job.pinnedOutputIndices, outputIndex);
  job.pinnedAt = normalizePinnedOutputIndices(job.pinnedOutputIndices, outputIndex)?.length ? job.pinnedAt ?? new Date().toISOString() : null;
  await upsertJobArchive(store, jobId, compacted.fullResponse);
  await writeStore(store);
}

export async function hideJobOutputs(jobId: string): Promise<void> {
  await deleteRecentJob(jobId);
}

export async function pruneRecentJobs(storeArgOrNow: RecentJobsStoreFile | number = Date.now(), maybeNow?: number): Promise<void> {
  const store = typeof storeArgOrNow === "number" ? await readStore() : storeArgOrNow;
  const now = typeof storeArgOrNow === "number" ? storeArgOrNow : (maybeNow ?? Date.now());
  const hiddenCutoff = now - RECENT_JOBS_HIDDEN_RETENTION_MS;
  const hiddenExpired = store.jobs.filter((job) => job.hiddenAt !== null && Date.parse(job.hiddenAt) < hiddenCutoff);
  const remainingAfterHiddenExpiry = store.jobs.filter((job) => !hiddenExpired.includes(job));

  const toDelete = new Set<string>(hiddenExpired.map((job) => job.jobId));
  const visibleJobs = remainingAfterHiddenExpiry.filter((job) => job.hiddenAt === null);
  const unpinnedVisibleJobs = visibleJobs.filter((job) => !isJobPinned(job));

  const unpinnedExcess = unpinnedVisibleJobs.length - RECENT_JOBS_UNPINNED_LIMIT;
  if (unpinnedExcess > 0) {
    const candidates = [...unpinnedVisibleJobs].sort(sortNewestFirst).slice(RECENT_JOBS_UNPINNED_LIMIT);
    for (const job of candidates) {
      toDelete.add(job.jobId);
    }
  }

  if (toDelete.size > 0) {
    store.jobs = store.jobs.filter((job) => !toDelete.has(job.jobId));
    store.archives = store.archives.filter((archive) => !toDelete.has(archive.jobId));
  }

  if (typeof storeArgOrNow === "number") {
    await writeStore(store);
  }
}

export async function clearRecentJobs(): Promise<void> {
  await writeStore(emptyStore());
}

export async function estimateRecentJobsStoredBytes(): Promise<number> {
  const store = await readStore();
  return JSON.stringify(store).length;
}

export async function updateRecentJobLifecycle(
  jobId: string,
  lifecycle: StoredRecentJob["lifecycle"],
  lastResponse: StoredRecentJob["lastResponse"] = null,
  lastError: StoredRecentJob["lastError"] = null
): Promise<void> {
  const store = await readStore();
  const job = store.jobs.find((entry) => entry.jobId === jobId);
  if (!job) {
    return;
  }

  const compacted = compactResponsePayload(lastResponse);
  job.lifecycle = lifecycle;
  job.lastResponse = compacted.compactedResponse;
  job.outputImageCount = compacted.totalImageCount;
  job.lastError = lastError;

  if (compacted.fullResponse) {
    await upsertJobArchive(store, jobId, compacted.fullResponse);
  }

  await writeStore(store);
}

export async function listArchivedJobs(): Promise<Array<{ jobId: string; sizeBytes: number }>> {
  const store = await readStore();
  return store.archives.map((entry) => ({
    jobId: entry.jobId,
    sizeBytes: JSON.stringify(entry.lastResponse).length
  }));
}

export async function pruneArchivedJobs(olderThanMs: number): Promise<number> {
  const store = await readStore();
  const cutoff = Date.now() - olderThanMs;
  const before = store.archives.length;
  store.archives = store.archives.filter((entry) => {
    const matchedJob = store.jobs.find((job) => job.jobId === entry.jobId);
    if (!matchedJob) {
      return false;
    }

    const finishedAt = matchedJob.lifecycle.finishedAt ?? matchedJob.submittedAt;
    const parsed = Date.parse(finishedAt);
    return Number.isNaN(parsed) ? true : parsed >= cutoff;
  });

  const removed = before - store.archives.length;
  if (removed > 0) {
    await writeStore(store);
  }

  return removed;
}
