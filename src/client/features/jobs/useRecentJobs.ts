import { useCallback, useEffect, useMemo, useState } from "react";
import type { RecentJobRecord } from "../../../shared/contracts/jobs";
import { cancelViaProxy, statusBatchViaProxy, statusViaProxy } from "../../lib/api/runpodProxyClient";
import { submitRunAndPersistRecentJob } from "../../lib/jobSubmission";
import { projectRecentJobOutputClusters } from "../../lib/jobOutputProjection";
import {
  getRecentJob,
  hideRecentJob,
  hideJobOutputs,
  listRecentJobs,
  removeRecentJobOutputImage as removeRecentJobOutputImageFromStorage,
  setRecentJobOutputPinned,
  toggleRecentJobOutputPinned,
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
};

export const RECENT_JOB_PAGE_SIZE = 10;
export const RECENT_JOB_STATUS_FILTERS = ["All", "IN_QUEUE", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"] as const;

export type RecentJobStatusFilter = (typeof RECENT_JOB_STATUS_FILTERS)[number];

const RECENT_JOB_STATUS_FILTER_STORAGE_KEY = "chara2imgRecentJobsStatusFilter";
let supportsStatusBatchPolling: boolean | null = null;

export function resetStatusBatchPollingSupportForTests(): void {
  supportsStatusBatchPolling = null;
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
  await hideRecentJob(jobId);
}

export async function setRecentJobOutputPinnedState(jobId: string, outputIndex: number, pinned: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
  return setRecentJobOutputPinned(jobId, outputIndex, pinned);
}

export async function toggleRecentJobOutputPinnedState(jobId: string, outputIndex: number, pinned: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
  return toggleRecentJobOutputPinned(jobId, outputIndex, pinned);
}

export function useRecentJobs(options: UseRecentJobsOptions = {}) {
  const endpointId = options.endpointId;
  const apiKey = options.apiKey;
  const [jobs, setJobs] = useState<RecentJobRecord[]>([]);
  const [statusFilter, setStatusFilterState] = useState<RecentJobStatusFilter>(() => getStoredStatusFilter());
  const [page, setPageState] = useState(1);
  const [warningJobIds, setWarningJobIds] = useState<string[]>([]);
  const [cancelingJobIds, setCancelingJobIds] = useState<string[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshRecentJobs = useCallback(async (resetPage: boolean = false) => {
    const nextJobs = await loadRecentJobs();
    setJobs(nextJobs);
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
    await removeRecentJobFromVisibleList(jobId);
    await refreshRecentJobs();
  }, [refreshRecentJobs]);

  const removeOutputImage = useCallback(async (jobId: string, outputIndex: number) => {
    await removeRecentJobOutputImage(jobId, outputIndex);
    await refreshRecentJobs();
  }, [refreshRecentJobs]);

  const removeJobOutputs = useCallback(async (jobId: string) => {
    await removeRecentJobOutputs(jobId);
    await refreshRecentJobs();
  }, [refreshRecentJobs]);

  const togglePinnedImage = useCallback(async (jobId: string, outputIndex: number, pinned: boolean) => {
    const result = await toggleRecentJobOutputPinnedState(jobId, outputIndex, pinned);
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

  const rerunJob = useCallback(
    async (jobId: string) => {
      const job = await rerunRecentJob(jobId, { endpointId, apiKey });
      await refreshRecentJobs(true);
      return job;
    },
    [apiKey, endpointId, refreshRecentJobs]
  );

  useEffect(() => {
    void refreshRecentJobs();
  }, [refreshRecentJobs]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void pollNow();
    }, JOB_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [pollNow]);

  const visibleJobs = useMemo(() => jobs.filter((job) => job.hiddenAt === null).sort(sortNewestFirst), [jobs]);
  const pinnedVisibleCount = useMemo(() => visibleJobs.filter((job) => Boolean(job.pinnedAt) || Boolean(job.pinnedOutputIndices?.length)).length, [visibleJobs]);
  const pinnedImageCount = useMemo(
    () => visibleJobs.reduce((count, job) => count + (job.pinnedOutputIndices?.length ?? 0), 0),
    [visibleJobs]
  );
  const canPinMoreJobs = true;
  const completedOutputClusters = useMemo(() => projectRecentJobOutputClusters(visibleJobs), [visibleJobs]);
  const filteredJobs = useMemo(() => filterJobsByStatus(visibleJobs, statusFilter), [statusFilter, visibleJobs]);
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
    loadJobInputs,
    removeVisibleJob,
    removeOutputImage,
    removeJobOutputs,
    togglePinnedImage,
    pinnedVisibleCount,
    pinnedImageCount,
    canPinMoreJobs,
    formatSubmittedAtRelative,
    hasTimedOut: hasJobObservationTimedOut
  };
}