import { useCallback, useEffect, useMemo, useState } from "react";
import type { RecentJobRecord } from "../../../shared/contracts/jobs";
import { cancelViaProxy, statusViaProxy } from "../../lib/api/runpodProxyClient";
import { submitRunAndPersistRecentJob } from "../../lib/jobSubmission";
import { projectRecentJobOutputClusters } from "../../lib/jobOutputProjection";
import { getRecentJob, hideRecentJob, hideJobOutputImage, hideJobOutputs, listRecentJobs, updateRecentJobLifecycle } from "../../lib/recentJobsStorage";
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

type RecentJobUpdateResult = {
  jobs: RecentJobRecord[];
  warningJobIds: string[];
};

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

          const status = String(response.status ?? job.lifecycle.status);
          const nextLifecycle = buildLifecycleSnapshotFromStatus(status);
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

  for (const job of currentJobs) {
    if (!options.apiKey) {
      continue;
    }

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

    try {
      const response = await statusViaProxy({
        endpointId: options.endpointId ?? job.endpointId,
        apiKey: options.apiKey ?? "",
        id: job.jobId
      });

      const status = String(response.status ?? job.lifecycle.status);
      const nextLifecycle = buildLifecycleSnapshotFromStatus(status);
      await applyLifecycleUpdate(job.jobId, nextLifecycle, response);
    } catch (error) {
      const status = error instanceof Error && "status" in error ? Number((error as { status?: unknown }).status) : undefined;

      if (status === 404) {
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
  await hideJobOutputImage(jobId, outputIndex);
}

export async function removeRecentJobOutputs(jobId: string): Promise<void> {
  await hideJobOutputs(jobId);
}

export async function removeRecentJobFromVisibleList(jobId: string): Promise<void> {
  await hideRecentJob(jobId);
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
    formatSubmittedAtRelative,
    hasTimedOut: hasJobObservationTimedOut
  };
}