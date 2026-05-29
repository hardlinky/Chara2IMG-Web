import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RecentJobRecord } from "../../../shared/contracts/jobs";
import { backupPinnedImageViaProxy, reconcilePinnedImagesViaProxy, releasePinnedImageViaProxy } from "../../lib/api/pinnedImageClient";
import { cancelViaProxy, statusBatchViaProxy, statusViaProxy } from "../../lib/api/runpodProxyClient";
import { submitRunAndPersistRecentJob } from "../../lib/jobSubmission";
import { projectRecentJobOutputClusters } from "../../lib/jobOutputProjection";
import { extractRunpodOutputImages } from "../../lib/runpodOutputImage";
import {
  startRecentJobsImageCompactionMigration,
  deleteRecentJob,
  getRecentJob,
  hideJobOutputs,
  listRecentJobs,
  replaceRecentJobOutputImageUrl,
  removeRecentJobOutputImage as removeRecentJobOutputImageFromStorage,
  setRecentJobOutputPinned,
  updateRecentJobLifecycle
} from "../../lib/recentJobsStorage";
import {
  JOB_POLL_INTERVAL_MS,
  buildLifecycleSnapshotFromStatus,
  classifyKnownJob404Lifecycle,
  classifyTimeoutLifecycle,
  formatSubmittedAtRelative,
  hasJobObservationTimedOut,
  isCancellableJobStatus
} from "./jobStatus";

type UseRecentJobsOptions = {
  endpointId?: string;
  apiKey?: string;
  includeOutputClusters?: boolean;
};

export const RECENT_JOB_PAGE_SIZE = 10;
const OUTPUTS_IN_MEMORY_PER_JOB_LIMIT = 8;
const ADAPTIVE_OFFLOAD_INTERVAL_MS = 60_000;
const ADAPTIVE_OFFLOAD_LONG_TASK_P95_MS = 120;
export const RECENT_JOB_STATUS_FILTERS = ["All", "IN_QUEUE", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"] as const;

export type RecentJobStatusFilter = (typeof RECENT_JOB_STATUS_FILTERS)[number];

const RECENT_JOB_STATUS_FILTER_STORAGE_KEY = "chara2imgRecentJobsStatusFilter";
let supportsStatusBatchPolling: boolean | null = null;

export function resetStatusBatchPollingSupportForTests(): void {
  supportsStatusBatchPolling = null;
}

function isArchivedImageUrl(value: string): boolean {
  return value.startsWith("/api/pinned-images/") || /\/api\/pinned-images\//.test(value);
}

type RecentJobUpdateResult = {
  jobs: RecentJobRecord[];
  warningJobIds: string[];
};

function extractErrorStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") {
    return status;
  }

  if (typeof status === "string") {
    const parsed = Number(status);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

function extractStatusFromPayload(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return fallback;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.status === "string" && record.status.trim()) {
    return record.status;
  }

  const nestedData = record.data;
  if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
    const nestedRecord = nestedData as Record<string, unknown>;
    if (typeof nestedRecord.status === "string" && nestedRecord.status.trim()) {
      return nestedRecord.status;
    }
  }

  return fallback;
}

function toDurationMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  // Runpod/Comfy payloads commonly return duration-like values in seconds.
  // Values >= 1000 are treated as ms to avoid multiplying already-ms durations.
  return value < 1000 ? Math.round(value * 1000) : Math.round(value);
}

function extractExecutionTimeMsFromPayload(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const direct =
    toDurationMs(record.executionTimeMs) ??
    toDurationMs(record.execution_time_ms) ??
    toDurationMs(record.executionTime) ??
    toDurationMs(record.execution_time) ??
    toDurationMs(record.duration);

  if (direct !== undefined) {
    return direct;
  }

  const nestedData = record.data;
  if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
    const nested = nestedData as Record<string, unknown>;
    return (
      toDurationMs(nested.executionTimeMs) ??
      toDurationMs(nested.execution_time_ms) ??
      toDurationMs(nested.executionTime) ??
      toDurationMs(nested.execution_time) ??
      toDurationMs(nested.duration)
    );
  }

  return undefined;
}

function sortNewestFirst(left: RecentJobRecord, right: RecentJobRecord): number {
  return right.submittedAt.localeCompare(left.submittedAt);
}

export function getStoredStatusFilter(): RecentJobStatusFilter {
  if (typeof window === "undefined") {
    return "All";
  }

  const stored = window.localStorage.getItem(RECENT_JOB_STATUS_FILTER_STORAGE_KEY) as RecentJobStatusFilter | null;
  return stored && RECENT_JOB_STATUS_FILTERS.includes(stored) ? stored : "All";
}

export function persistStatusFilter(statusFilter: RecentJobStatusFilter): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(RECENT_JOB_STATUS_FILTER_STORAGE_KEY, statusFilter);
}

export function filterJobsByStatus(jobs: RecentJobRecord[], statusFilter: RecentJobStatusFilter): RecentJobRecord[] {
  if (statusFilter === "All") {
    return jobs;
  }

  return jobs.filter((job) => job.lifecycle.status === statusFilter);
}

export async function loadRecentJobs(): Promise<RecentJobRecord[]> {
  return (await listRecentJobs()).sort(sortNewestFirst);
}

async function applyLifecycleUpdate(
  jobId: string,
  lifecycle: RecentJobRecord["lifecycle"],
  lastResponse: unknown = null,
  lastError: string | null = null
): Promise<void> {
  await updateRecentJobLifecycle(jobId, lifecycle, lastResponse as Record<string, unknown> | null, lastError);
}

export async function pollSingleJob(jobId: string, options: UseRecentJobsOptions = {}): Promise<{ jobs: RecentJobRecord[]; warningJobIds: string[] }> {
  const warningJobIds: string[] = [];

  if (options.apiKey) {
    const job = (await loadRecentJobs()).find((candidate) => candidate.jobId === jobId);

    if (job) {
      const timeoutLifecycle = classifyTimeoutLifecycle(job);
      if (timeoutLifecycle) {
        await applyLifecycleUpdate(job.jobId, timeoutLifecycle);
      } else if (!job.lifecycle.isTerminal && isCancellableJobStatus(job.lifecycle.status)) {
        try {
          const response = await statusViaProxy({
            endpointId: options.endpointId ?? job.endpointId,
            apiKey: options.apiKey,
            id: job.jobId
          });

          const status = extractStatusFromPayload(response, job.lifecycle.status);
          const nextLifecycle = buildLifecycleSnapshotFromStatus(status, undefined, extractExecutionTimeMsFromPayload(response));
          await applyLifecycleUpdate(job.jobId, nextLifecycle, response);
        } catch (error) {
          const status = error instanceof Error && "status" in error ? Number((error as { status?: unknown }).status) : undefined;

          if (status === 404) {
            await applyLifecycleUpdate(job.jobId, classifyKnownJob404Lifecycle(job));
          } else {
            warningJobIds.push(job.jobId);
          }
        }
      }
    }
  }

  return {
    jobs: await loadRecentJobs(),
    warningJobIds
  };
}

export async function pollRecentJobsOnce(options: UseRecentJobsOptions = {}): Promise<RecentJobUpdateResult> {
  const currentJobs = await loadRecentJobs();
  const warningJobIds: string[] = [];

  if (!options.apiKey) {
    return {
      jobs: await loadRecentJobs(),
      warningJobIds
    };
  }

  const jobsToPoll: RecentJobRecord[] = [];

  for (const job of currentJobs) {
    const timeoutLifecycle = classifyTimeoutLifecycle(job);
    if (timeoutLifecycle) {
      await applyLifecycleUpdate(job.jobId, timeoutLifecycle);
      continue;
    }

    if (!isCancellableJobStatus(job.lifecycle.status) && !job.lifecycle.isTerminal) {
      continue;
    }

    if (job.lifecycle.isTerminal) {
      continue;
    }

    jobsToPoll.push(job);
  }

  if (jobsToPoll.length === 0) {
    return {
      jobs: await loadRecentJobs(),
      warningJobIds
    };
  }

  let batch: Awaited<ReturnType<typeof statusBatchViaProxy>> | null = null;
  if (supportsStatusBatchPolling !== false) {
    try {
      batch = await statusBatchViaProxy({
        endpointId: options.endpointId ?? jobsToPoll[0]!.endpointId,
        apiKey: options.apiKey,
        ids: jobsToPoll.map((job) => job.jobId),
        knownIds: currentJobs.map((job) => job.jobId)
      });
      supportsStatusBatchPolling = true;
    } catch (error) {
      if (extractErrorStatusCode(error) !== 404) {
        throw error;
      }

      supportsStatusBatchPolling = false;
    }
  }

  if (!batch) {
    for (const job of jobsToPoll) {
      try {
        const response = await statusViaProxy({
          endpointId: options.endpointId ?? job.endpointId,
          apiKey: options.apiKey,
          id: job.jobId
        });

        const status = extractStatusFromPayload(response, job.lifecycle.status);
        const nextLifecycle = buildLifecycleSnapshotFromStatus(status, undefined, extractExecutionTimeMsFromPayload(response));
        await applyLifecycleUpdate(job.jobId, nextLifecycle, response);
      } catch (error) {
        if (extractErrorStatusCode(error) === 404) {
          await applyLifecycleUpdate(job.jobId, classifyKnownJob404Lifecycle(job));
          continue;
        }

        warningJobIds.push(job.jobId);
      }
    }

    return {
      jobs: await loadRecentJobs(),
      warningJobIds
    };
  }

  const resultById = new Map(batch.items.map((item) => [item.id, item]));

  for (const job of jobsToPoll) {
    const item = resultById.get(job.jobId);
    if (!item) {
      warningJobIds.push(job.jobId);
      continue;
    }

    if (item.ok && item.data) {
      const status = extractStatusFromPayload(item.data, job.lifecycle.status);
      const nextLifecycle = buildLifecycleSnapshotFromStatus(status, undefined, extractExecutionTimeMsFromPayload(item.data));
      await applyLifecycleUpdate(job.jobId, nextLifecycle, item.data);
      continue;
    }

    if (item.statusCode === 404) {
      await applyLifecycleUpdate(job.jobId, classifyKnownJob404Lifecycle(job));
      continue;
    }

    if (!item.ok) {
      warningJobIds.push(job.jobId);
    }
  }

  return {
    jobs: await loadRecentJobs(),
    warningJobIds
  };
}

export async function cancelRecentJob(jobId: string, options: UseRecentJobsOptions = {}): Promise<void> {
  const jobs = await loadRecentJobs();
  const job = jobs.find((candidate) => candidate.jobId === jobId);

  if (!job || !isCancellableJobStatus(job.lifecycle.status)) {
    return;
  }

  await applyLifecycleUpdate(jobId, {
    ...job.lifecycle,
    status: "CANCELLING",
    isTerminal: false,
    terminalReason: undefined,
    warning: null,
    lastCheckedAt: new Date().toISOString()
  });

  try {
    await cancelViaProxy({
      endpointId: options.endpointId ?? job.endpointId,
      apiKey: options.apiKey ?? "",
      id: jobId
    });
  } catch (error) {
    await applyLifecycleUpdate(jobId, job.lifecycle, job.lastResponse, error instanceof Error ? error.message : String(error));
    throw error;
  }

  await applyLifecycleUpdate(jobId, {
    ...job.lifecycle,
    status: "CANCELLED",
    isTerminal: true,
    terminalReason: "cancelled",
    finishedAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString(),
    warning: null,
    failureReason: null
  });
}

export async function rerunRecentJob(jobId: string, options: UseRecentJobsOptions = {}): Promise<RecentJobRecord | null> {
  return rerunRecentJobWithDependencies(jobId, options, {
    submitRunAndPersistRecentJob
  });
}

export async function rerunRecentJobWithDependencies(
  jobId: string,
  options: UseRecentJobsOptions = {},
  dependencies: {
    submitRunAndPersistRecentJob: typeof submitRunAndPersistRecentJob;
  }
): Promise<RecentJobRecord | null> {
  if (!options.apiKey) {
    return null;
  }

  const job = await getRecentJob(jobId);
  if (!job) {
    return null;
  }

  await dependencies.submitRunAndPersistRecentJob({
    endpointId: job.endpointId,
    apiKey: options.apiKey,
    submittedInput: job.provenance.submittedInput,
    snapshot: {
      templateFingerprint: job.provenance.templateFingerprint,
      workflowFileName: job.provenance.workflowFileName,
      draftValues: job.provenance.draftValues,
      submittedInput: job.provenance.submittedInput
    }
  });

  return job;
}

export async function removeRecentJobOutputImage(jobId: string, outputIndex: number): Promise<void> {
  await removeRecentJobOutputImageFromStorage(jobId, outputIndex);
}

export async function removeRecentJobOutputs(jobId: string): Promise<void> {
  await hideJobOutputs(jobId);
}

export async function removeRecentJobFromVisibleList(jobId: string): Promise<void> {
  await deleteRecentJob(jobId);
}

export async function loadRecentJobOutputCluster(jobId: string) {
  const job = await getRecentJob(jobId);
  if (!job) {
    return null;
  }

  return projectRecentJobOutputClusters([job])[0] ?? null;
}

export async function setRecentJobOutputPinnedState(jobId: string, outputIndex: number, pinned: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
  return setRecentJobOutputPinned(jobId, outputIndex, pinned);
}

export async function toggleRecentJobOutputPinnedState(
  jobId: string,
  outputIndex: number,
  pinned: boolean,
  replacementDataUrl?: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  return setRecentJobOutputPinned(jobId, outputIndex, pinned, new Date().toISOString(), replacementDataUrl);
}

export function useRecentJobs(options: UseRecentJobsOptions = {}) {
  const endpointId = options.endpointId;
  const apiKey = options.apiKey;
  const includeOutputClusters = options.includeOutputClusters ?? true;
  const [jobs, setJobs] = useState<RecentJobRecord[]>([]);
  const [statusFilter, setStatusFilterState] = useState<RecentJobStatusFilter>(() => getStoredStatusFilter());
  const [page, setPageState] = useState(1);
  const [warningJobIds, setWarningJobIds] = useState<string[]>([]);
  const [cancelingJobIds, setCancelingJobIds] = useState<string[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageRefreshToken, setStorageRefreshToken] = useState(0);
  const lastReconcileSignatureRef = useRef<string>("");
  const longTaskDurationsRef = useRef<number[]>([]);
  const adaptiveOffloadRunningRef = useRef(false);

  const runAdaptiveOffload = useCallback(async (maxImagesToOffload: number) => {
    if (maxImagesToOffload <= 0 || adaptiveOffloadRunningRef.current) {
      return;
    }

    adaptiveOffloadRunningRef.current = true;
    try {
      const oldestFirstVisibleJobs = [...jobs]
        .filter((job) => job.hiddenAt === null)
        .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
      let replacedCount = 0;

      for (const job of oldestFirstVisibleJobs) {
        if (replacedCount >= maxImagesToOffload) {
          break;
        }

        // Legacy records may indicate "job-level pinned" with no explicit output indices.
        if (job.pinnedAt && (!job.pinnedOutputIndices || job.pinnedOutputIndices.length === 0)) {
          continue;
        }

        const hydrated = await getRecentJob(job.jobId);
        const response = hydrated?.lastResponse;
        if (!response) {
          continue;
        }

        const pinnedIndices = new Set(job.pinnedOutputIndices ?? []);
        const extractedImages = extractRunpodOutputImages(response);

        for (let outputIndex = 0; outputIndex < extractedImages.length; outputIndex += 1) {
          if (replacedCount >= maxImagesToOffload) {
            break;
          }

          if (pinnedIndices.has(outputIndex)) {
            continue;
          }

          const image = extractedImages[outputIndex];
          if (!image || !image.dataUrl.startsWith("data:")) {
            continue;
          }

          try {
            const backup = await backupPinnedImageViaProxy({
              jobId: job.jobId,
              outputIndex,
              dataUrl: image.dataUrl,
              mimeType: image.mimeType
            });

            const replaced = await replaceRecentJobOutputImageUrl(job.jobId, outputIndex, backup.imageUrl);
            if (replaced.ok) {
              replacedCount += 1;
            }
          } catch {
            // Offload is opportunistic; ignore per-image failures.
          }
        }
      }

      if (replacedCount > 0) {
        const nextJobs = await loadRecentJobs();
        setJobs(nextJobs);
        setStorageRefreshToken((current) => current + 1);
      }
    } finally {
      adaptiveOffloadRunningRef.current = false;
    }
  }, [jobs]);

  const refreshRecentJobs = useCallback(async (resetPage: boolean = false) => {
    const nextJobs = await loadRecentJobs();
    setJobs(nextJobs);
    setStorageRefreshToken((current) => current + 1);
    if (resetPage) {
      setPageState(1);
    }
    return nextJobs;
  }, []);

  const pollNow = useCallback(async () => {
    setIsPolling(true);
    try {
      if (!apiKey) {
        setJobs(await loadRecentJobs());
        setWarningJobIds([]);
        return;
      }

      const result = await pollRecentJobsOnce({ endpointId, apiKey });
      setJobs(result.jobs);
      setWarningJobIds(result.warningJobIds);
      setError(null);
    } catch (pollError) {
      setError(pollError instanceof Error ? pollError.message : "Failed to refresh jobs.");
    } finally {
      setIsPolling(false);
    }
  }, [apiKey, endpointId]);

  const pollJob = useCallback(
    async (jobId: string) => {
      try {
        const result = await pollSingleJob(jobId, { endpointId, apiKey });
        setJobs(result.jobs);
        setWarningJobIds((previous) => {
          const merged = [...previous.filter((id) => id !== jobId), ...result.warningJobIds];
          return merged;
        });
        setError(null);
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : "Failed to refresh job.");
      }
    },
    [apiKey, endpointId]
  );

  const cancelJob = useCallback(
    async (jobId: string) => {
      if (!apiKey) {
        return;
      }

      setCancelingJobIds((previous) => (previous.includes(jobId) ? previous : [...previous, jobId]));

      try {
        await cancelRecentJob(jobId, { endpointId, apiKey });
        await refreshRecentJobs();
      } finally {
        setCancelingJobIds((previous) => previous.filter((candidate) => candidate !== jobId));
      }
    },
    [apiKey, endpointId, refreshRecentJobs]
  );

  const removeVisibleJob = useCallback(async (jobId: string) => {
    const job = await getRecentJob(jobId);
    const archivedImageReleases = job?.lastResponse
      ? extractRunpodOutputImages(job.lastResponse)
        .map((image, outputIndex) => ({ imageUrl: image.dataUrl, outputIndex }))
        .filter((entry) => isArchivedImageUrl(entry.imageUrl))
      : [];

    await removeRecentJobFromVisibleList(jobId);

    if (archivedImageReleases.length > 0) {
      await Promise.allSettled(
        archivedImageReleases.map((entry) => releasePinnedImageViaProxy({ imageUrl: entry.imageUrl, jobId, outputIndex: entry.outputIndex }))
      );
    }

    await refreshRecentJobs();
  }, [refreshRecentJobs]);

  const removeOutputImage = useCallback(async (jobId: string, outputIndex: number) => {
    const job = await getRecentJob(jobId);
    const targetImage = job?.lastResponse ? extractRunpodOutputImages(job.lastResponse)[outputIndex] : null;

    await removeRecentJobOutputImage(jobId, outputIndex);

    if (targetImage && isArchivedImageUrl(targetImage.dataUrl)) {
      await releasePinnedImageViaProxy({ imageUrl: targetImage.dataUrl, jobId, outputIndex }).catch(() => {
        setError(`Failed to release archived image backup for ${jobId}.`);
      });
    }

    await refreshRecentJobs();
  }, [refreshRecentJobs]);

  const removeJobOutputs = useCallback(async (jobId: string) => {
    const job = await getRecentJob(jobId);
    const archivedImageReleases = job?.lastResponse
      ? extractRunpodOutputImages(job.lastResponse)
        .map((image, outputIndex) => ({ imageUrl: image.dataUrl, outputIndex }))
        .filter((entry) => isArchivedImageUrl(entry.imageUrl))
      : [];

    await removeRecentJobOutputs(jobId);

    if (archivedImageReleases.length > 0) {
      await Promise.allSettled(
        archivedImageReleases.map((entry) => releasePinnedImageViaProxy({ imageUrl: entry.imageUrl, jobId, outputIndex: entry.outputIndex }))
      );
    }

    await refreshRecentJobs();
  }, [refreshRecentJobs]);

  const togglePinnedImage = useCallback(async (jobId: string, outputIndex: number, pinned: boolean) => {
    let replacementDataUrl: string | undefined;

    if (pinned) {
      const job = await getRecentJob(jobId);
      const response = job?.lastResponse;
      if (!response) {
        return { ok: false as const, reason: "Job output is not available to pin." };
      }

      const extractedImages = extractRunpodOutputImages(response);
      const targetImage = extractedImages[outputIndex];
      if (!targetImage) {
        return { ok: false as const, reason: "Job output is not available to pin." };
      }

      if (targetImage.dataUrl.startsWith("data:")) {
        const backup = await backupPinnedImageViaProxy({
          jobId,
          outputIndex,
          dataUrl: targetImage.dataUrl,
          mimeType: targetImage.mimeType
        });

        replacementDataUrl = backup.imageUrl;
      }
    }

    const result = await toggleRecentJobOutputPinnedState(jobId, outputIndex, pinned, replacementDataUrl);
    await refreshRecentJobs();
    if (!result.ok) {
      setError(result.reason);
    }
    return result;
  }, [refreshRecentJobs]);

  const setStatusFilter = useCallback((nextStatusFilter: RecentJobStatusFilter) => {
    setStatusFilterState(nextStatusFilter);
    persistStatusFilter(nextStatusFilter);
    setPageState(1);
  }, []);

  const setPage = useCallback((nextPage: number) => {
    setPageState(Math.max(1, nextPage));
  }, []);

  const handleNewSubmission = useCallback(async () => {
    await refreshRecentJobs(true);
  }, [refreshRecentJobs]);

  const loadJobInputs = useCallback(async (jobId: string): Promise<RecentJobRecord | null> => {
    return getRecentJob(jobId);
  }, []);

  const loadOutputCluster = useCallback(async (jobId: string) => {
    return loadRecentJobOutputCluster(jobId);
  }, []);

  const rerunJob = useCallback(
    async (jobId: string) => {
      const job = await rerunRecentJob(jobId, { endpointId, apiKey });
      await refreshRecentJobs(true);
      return job;
    },
    [apiKey, endpointId, refreshRecentJobs]
  );

  useEffect(() => {
    void startRecentJobsImageCompactionMigration();
  }, []);

  useEffect(() => {
    void refreshRecentJobs();
  }, [refreshRecentJobs]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let migratedAny = false;

      for (const job of jobs) {
        if (!job.pinnedOutputIndices || job.pinnedOutputIndices.length === 0) {
          continue;
        }

        const hydrated = await getRecentJob(job.jobId);
        const response = hydrated?.lastResponse;
        if (!response) {
          continue;
        }

        const extractedImages = extractRunpodOutputImages(response);

        for (const outputIndex of job.pinnedOutputIndices) {
          const targetImage = extractedImages[outputIndex];
          if (!targetImage || !targetImage.dataUrl.startsWith("data:")) {
            continue;
          }

          try {
            const backup = await backupPinnedImageViaProxy({
              jobId: job.jobId,
              outputIndex,
              dataUrl: targetImage.dataUrl,
              mimeType: targetImage.mimeType
            });

            await setRecentJobOutputPinned(job.jobId, outputIndex, true, job.pinnedAt ?? new Date().toISOString(), backup.imageUrl);
            migratedAny = true;
          } catch {
            if (!cancelled) {
              setError(`Failed to migrate pinned image backup for ${job.jobId}.`);
            }
          }
        }
      }

      if (migratedAny && !cancelled) {
        await refreshRecentJobs();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobs, refreshRecentJobs]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void pollNow();
    }, JOB_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [pollNow]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!("PerformanceObserver" in window)) {
      return;
    }

    let observer: PerformanceObserver | null = null;

    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (typeof entry.duration !== "number" || !Number.isFinite(entry.duration)) {
            continue;
          }

          longTaskDurationsRef.current.push(entry.duration);
        }

        if (longTaskDurationsRef.current.length > 60) {
          longTaskDurationsRef.current = longTaskDurationsRef.current.slice(-60);
        }
      });

      observer.observe({ entryTypes: ["longtask"] });
    } catch {
      observer = null;
    }

    return () => {
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (cancelled) {
        return;
      }

      let usageRatio = 0;
      if (navigator.storage?.estimate) {
        try {
          const estimate = await navigator.storage.estimate();
          if (typeof estimate.usage === "number" && typeof estimate.quota === "number" && estimate.quota > 0) {
            usageRatio = estimate.usage / estimate.quota;
          }
        } catch {
          // Ignore estimate failures.
        }
      }

      const durations = [...longTaskDurationsRef.current].sort((left, right) => left - right);
      const p95Index = durations.length > 0 ? Math.min(durations.length - 1, Math.floor(durations.length * 0.95)) : -1;
      const p95LongTaskMs = p95Index >= 0 ? durations[p95Index]! : 0;

      let maxImagesToOffload = 0;
      if (usageRatio >= 0.9) {
        maxImagesToOffload = 20;
      } else if (usageRatio >= 0.8) {
        maxImagesToOffload = 12;
      } else if (usageRatio >= 0.7) {
        maxImagesToOffload = 6;
      } else if (usageRatio >= 0.6 && p95LongTaskMs >= ADAPTIVE_OFFLOAD_LONG_TASK_P95_MS) {
        maxImagesToOffload = 4;
      }

      if (maxImagesToOffload > 0) {
        await runAdaptiveOffload(maxImagesToOffload);
      }
    };

    const interval = window.setInterval(() => {
      void tick();
    }, ADAPTIVE_OFFLOAD_INTERVAL_MS);

    void tick();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [runAdaptiveOffload]);

  const visibleJobs = useMemo(() => jobs.filter((job) => job.hiddenAt === null).sort(sortNewestFirst), [jobs]);
  const pinnedVisibleCount = useMemo(() => visibleJobs.filter((job) => Boolean(job.pinnedAt) || Boolean(job.pinnedOutputIndices?.length)).length, [visibleJobs]);
  const pinnedImageCount = useMemo(
    () => visibleJobs.reduce((count, job) => count + (job.pinnedOutputIndices?.length ?? 0), 0),
    [visibleJobs]
  );
  const transientJobsCount = useMemo(
    () => visibleJobs.filter((job) => job.lifecycle.status === "IN_QUEUE" || job.lifecycle.status === "IN_PROGRESS").length,
    [visibleJobs]
  );
  const canPinMoreJobs = true;
  const completedOutputClusters = useMemo(() => {
    if (!includeOutputClusters) {
      return [];
    }

    return projectRecentJobOutputClusters(visibleJobs, {
      maxOutputsPerJob: OUTPUTS_IN_MEMORY_PER_JOB_LIMIT
    });
  }, [includeOutputClusters, visibleJobs]);
  const filteredJobs = useMemo(() => filterJobsByStatus(visibleJobs, statusFilter), [statusFilter, visibleJobs]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const refs = visibleJobs.flatMap((job) => {
        const response = job.lastResponse;
        if (!response) {
          return [] as Array<{ jobId: string; outputIndex: number; imageUrl: string }>;
        }

        return extractRunpodOutputImages(response)
          .map((image, outputIndex) => ({
            jobId: job.jobId,
            outputIndex,
            imageUrl: image.dataUrl
          }))
          .filter((entry) => isArchivedImageUrl(entry.imageUrl));
      });

      const signature = refs.map((ref) => `${ref.jobId}:${ref.outputIndex}:${ref.imageUrl}`).sort().join("|");
      if (signature === lastReconcileSignatureRef.current) {
        return;
      }

      lastReconcileSignatureRef.current = signature;

      try {
        await reconcilePinnedImagesViaProxy({ refs });
      } catch {
        if (!cancelled) {
          setError("Failed to reconcile archived image references.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visibleJobs]);

  const pageCount = Math.max(1, Math.ceil(filteredJobs.length / RECENT_JOB_PAGE_SIZE));

  useEffect(() => {
    if (page > pageCount) {
      setPageState(pageCount);
    }
  }, [page, pageCount]);

  const pagedJobs = useMemo(
    () => filteredJobs.slice((page - 1) * RECENT_JOB_PAGE_SIZE, page * RECENT_JOB_PAGE_SIZE),
    [filteredJobs, page]
  );

  const pageNumbers = useMemo(() => Array.from({ length: pageCount }, (_, index) => index + 1), [pageCount]);

  return {
    jobs: pagedJobs,
    visibleJobs,
    completedOutputClusters,
    filteredJobs,
    page,
    pageCount,
    pageNumbers,
    statusFilter,
    setStatusFilter,
    setPage,
    warningJobIds,
    cancelingJobIds,
    isPolling,
    error,
    refreshRecentJobs,
    handleNewSubmission,
    pollNow,
    pollJob,
    cancelJob,
    rerunJob,
    loadOutputCluster,
    loadJobInputs,
    removeVisibleJob,
    removeOutputImage,
    removeJobOutputs,
    togglePinnedImage,
    pinnedVisibleCount,
    pinnedImageCount,
    transientJobsCount,
    storageRefreshToken,
    canPinMoreJobs,
    formatSubmittedAtRelative,
    hasTimedOut: hasJobObservationTimedOut
  };
}