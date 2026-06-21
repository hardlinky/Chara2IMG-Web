import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RecentJobRecord } from "../../../shared/contracts/jobs";
import { cancelViaProxy } from "../../lib/api/runpodProxyClient";
import { listJobs, deleteJob, pinImage, unpinImage, getJob, getJobInputs } from "../../lib/api/jobsClient";
import { getRecentJob } from "../../lib/recentJobsStorage"; // still used by non-rerun paths
import { submitRunAndPersistRecentJob } from "../../lib/jobSubmission";
import { projectRecentJobOutputClusters } from "../../lib/jobOutputProjection";
import { sanitizeWorkflowForExport } from "../../lib/workflowExport";
import { pruneExpiredImageCache, deleteImage } from "../../lib/imageCache";
import {
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
const POLL_INTERVAL_MS = 10_000;
const ADAPTIVE_OFFLOAD_COMPLETION_GRACE_PERIOD_MS = 60 * 60 * 1000;

export const RECENT_JOB_STATUS_FILTERS = ["All", "IN_QUEUE", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"] as const;
export type RecentJobStatusFilter = (typeof RECENT_JOB_STATUS_FILTERS)[number];

const RECENT_JOB_STATUS_FILTER_STORAGE_KEY = "chara2imgRecentJobsStatusFilter";

export function shouldDeferAdaptiveOffload(job: Pick<RecentJobRecord, "hiddenAt" | "lifecycle" | "submittedAt">, now: number = Date.now()): boolean {
  if (job.hiddenAt !== null) {
    return true;
  }

  if (!job.lifecycle.isTerminal) {
    return true;
  }

  const finishedAt = job.lifecycle.finishedAt ?? job.submittedAt;
  const finishedAtMs = Date.parse(finishedAt);
  if (Number.isNaN(finishedAtMs)) {
    return true;
  }

  return now - finishedAtMs < ADAPTIVE_OFFLOAD_COMPLETION_GRACE_PERIOD_MS;
}

export function buildPinnedWorkflowMetadata(job: RecentJobRecord): {
  workflowFileName?: string;
  workflowTemplate?: Record<string, unknown>;
  workflowInputs?: Record<string, unknown>;
  workflowJson?: Record<string, unknown>;
} {
  const submittedInput = job.provenance.submittedInput && typeof job.provenance.submittedInput === "object"
    ? (job.provenance.submittedInput as Record<string, unknown>)
    : null;
  const workflowTemplateSource = submittedInput && submittedInput.workflow && typeof submittedInput.workflow === "object" && !Array.isArray(submittedInput.workflow)
    ? (submittedInput.workflow as Record<string, unknown>)
    : submittedInput;
  const workflowInputsSource = submittedInput && submittedInput.workflow && typeof submittedInput.workflow === "object" && !Array.isArray(submittedInput.workflow)
    ? Object.fromEntries(Object.entries(submittedInput).filter(([key]) => key !== "workflow"))
    : {};
  const workflowTemplate = workflowTemplateSource && typeof workflowTemplateSource === "object" && !Array.isArray(workflowTemplateSource)
    ? sanitizeWorkflowForExport(workflowTemplateSource as Record<string, unknown>)
    : undefined;
  const workflowInputs = Object.keys(workflowInputsSource).length > 0
    ? sanitizeWorkflowForExport(workflowInputsSource)
    : undefined;
  const workflowJson = workflowTemplate && workflowInputs ? { workflow: workflowTemplate, ...workflowInputs } : workflowTemplate;

  return {
    workflowFileName: job.provenance.workflowFileName,
    workflowTemplate,
    workflowInputs,
    workflowJson
  };
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

function sortNewestFirst(left: RecentJobRecord, right: RecentJobRecord): number {
  return right.submittedAt.localeCompare(left.submittedAt);
}

export async function removeRecentJobFromVisibleList(jobId: string): Promise<void> {
  await deleteJob(jobId);
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

  // Fetch from server (source of truth); fall back to IndexedDB for pre-rework jobs.
  let job = await getJob(jobId);
  if (!job) {
    job = await getRecentJob(jobId);
  }
  if (!job) {
    return null;
  }

  // adaptJobRecord zeroes submittedInput — fetch the real workflow from the server.
  const serverInputs = await getJobInputs(jobId);
  const submittedInput = serverInputs?.submittedInput ?? job.provenance.submittedInput;

  await dependencies.submitRunAndPersistRecentJob({
    endpointId: job.endpointId,
    apiKey: options.apiKey,
    submittedInput,
    snapshot: {
      templateFingerprint: job.provenance.templateFingerprint,
      workflowFileName: job.provenance.workflowFileName,
      draftValues: job.provenance.draftValues,
      submittedInput,
    }
  });

  return job;
}

export async function rerunRecentJob(jobId: string, options: UseRecentJobsOptions = {}): Promise<RecentJobRecord | null> {
  return rerunRecentJobWithDependencies(jobId, options, {
    submitRunAndPersistRecentJob
  });
}

export function useRecentJobs(options: UseRecentJobsOptions = {}) {
  const endpointId = options.endpointId;
  const apiKey = options.apiKey;
  const includeOutputClusters = options.includeOutputClusters ?? true;
  const [jobs, setJobs] = useState<RecentJobRecord[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [statusFilter, setStatusFilterState] = useState<RecentJobStatusFilter>(() => getStoredStatusFilter());
  const [page, setPageState] = useState(1);
  const [cancelingJobIds, setCancelingJobIds] = useState<string[]>([]);
  const [deletingJobIds, setDeletingJobIds] = useState<Set<string>>(new Set());
  const [pinningImageKeys, setPinningImageKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [storageRefreshToken, setStorageRefreshToken] = useState(0);

  // Ref so fetchJobs can be called imperatively (e.g. after submit/cancel).
  const fetchJobsRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchJobs() {
      try {
        const fetched = await listJobs();
        if (!cancelled) {
          setJobs(fetched);
          setStorageRefreshToken((current) => current + 1);
        }
      } catch {
        // silent - keep stale data on error
      } finally {
        if (!cancelled) setIsInitialLoading(false);
      }
    }

    fetchJobsRef.current = fetchJobs;

    void fetchJobs();
    const interval = setInterval(() => {
      void pruneExpiredImageCache().catch(() => {
        // prune errors are non-critical; ignore silently
      });
      void fetchJobs();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleDeleteJob = useCallback(async (jobId: string) => {
    setDeletingJobIds((prev) => new Set(prev).add(jobId));
    try {
      await deleteJob(jobId);
      setJobs((prev) => prev.filter((j) => j.jobId !== jobId));
    } catch {
      // Re-enable button on error.
      setDeletingJobIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  }, []);

  const cancelJob = useCallback(async (jobId: string) => {
    if (!apiKey) {
      return;
    }

    setCancelingJobIds((previous) => (previous.includes(jobId) ? previous : [...previous, jobId]));

    try {
      if (isCancellableJobStatus(jobs.find((j) => j.jobId === jobId)?.lifecycle.status ?? "")) {
        await cancelViaProxy({
          endpointId: endpointId ?? "",
          apiKey,
          id: jobId
        });
      }

      if (fetchJobsRef.current) {
        await fetchJobsRef.current();
      }
    } catch {
      // Ignore cancel errors - next poll will reflect updated state.
    } finally {
      setCancelingJobIds((previous) => previous.filter((candidate) => candidate !== jobId));
    }
  }, [apiKey, endpointId, jobs]);

  const rerunJob = useCallback(
    async (jobId: string) => {
      const job = await rerunRecentJob(jobId, { endpointId, apiKey });
      if (fetchJobsRef.current) {
        await fetchJobsRef.current();
      }
      return job;
    },
    [apiKey, endpointId]
  );

  const pollJob = useCallback(async (_jobId: string) => {
    // In the server-polling model, just refresh the full list.
    if (fetchJobsRef.current) {
      await fetchJobsRef.current();
    }
    setError(null);
  }, []);

  const loadJobInputs = useCallback(
    async (jobId: string): Promise<RecentJobRecord | null> => {
      return jobs.find((j) => j.jobId === jobId) ?? null;
    },
    [jobs]
  );

  const removeVisibleJob = useCallback(
    async (jobId: string) => {
      await handleDeleteJob(jobId);
    },
    [handleDeleteJob]
  );

  const removeOutputImage = useCallback(async (jobId: string, outputIndex: number) => {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.jobId !== jobId) return j;
        const hidden = new Set(j.hiddenOutputIndices ?? []);
        hidden.add(outputIndex);
        return { ...j, hiddenOutputIndices: Array.from(hidden) };
      })
    );
  }, []);

  const removeJobOutputs = useCallback(async (jobId: string) => {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.jobId !== jobId) return j;
        return { ...j, outputsHidden: true };
      })
    );
  }, []);

  const loadOutputCluster = useCallback(
    async (jobId: string) => {
      const job = jobs.find((j) => j.jobId === jobId);
      if (!job) return null;
      return projectRecentJobOutputClusters([job])[0] ?? null;
    },
    [jobs]
  );

  const togglePinnedImage = useCallback(
    async (
      jobId: string,
      outputIndex: number,
      pinned: boolean
    ): Promise<{ ok: true } | { ok: false; reason: string }> => {
      const key = `${jobId}:${outputIndex}`;

      // D3: disable button immediately, do NOT flip UI state
      setPinningImageKeys((prev) => new Set(prev).add(key));

      try {
        if (pinned) {
          // PIN action: call server, evict IndexedDB cache, refresh list
          const result = await pinImage(jobId, outputIndex);
          if (!result.ok) {
            return { ok: false, reason: "Pin failed" };
          }
          // Evict the cached image so the next render fetches fresh from archive
          await deleteImage(`/api/jobs/${jobId}/images/${outputIndex}`);
        } else {
          // UNPIN action: call server, refresh list
          const result = await unpinImage(jobId, outputIndex);
          if (!result.ok) {
            return { ok: false, reason: "Unpin failed" };
          }
          // Update local imageUnarchiveExpiries so projection can show countdown immediately
          setJobs((prev) =>
            prev.map((j) => {
              if (j.jobId !== jobId) return j;
              return {
                ...j,
                imageUnarchiveExpiries: {
                  ...(j.imageUnarchiveExpiries ?? {}),
                  [String(outputIndex)]: result.unarchiveExpiresAt,
                },
                pinnedOutputIndices: (j.pinnedOutputIndices ?? []).filter((i) => i !== outputIndex),
              };
            })
          );
        }

        // Refresh from server to get authoritative state
        if (fetchJobsRef.current) {
          await fetchJobsRef.current();
        }

        return { ok: true };
      } catch {
        return { ok: false, reason: "Request failed" };
      } finally {
        // Always clear loading state — on success AND failure
        setPinningImageKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    []
  );

  const setStatusFilter = useCallback((nextStatusFilter: RecentJobStatusFilter) => {
    setStatusFilterState(nextStatusFilter);
    persistStatusFilter(nextStatusFilter);
    setPageState(1);
  }, []);

  const setPage = useCallback((nextPage: number) => {
    setPageState(Math.max(1, nextPage));
  }, []);

  const handleNewSubmission = useCallback(async () => {
    setPageState(1);
    if (fetchJobsRef.current) {
      await fetchJobsRef.current();
    }
  }, []);

  const visibleJobs = useMemo(() => jobs.filter((job) => job.hiddenAt === null).sort(sortNewestFirst), [jobs]);
  const pinnedVisibleCount = useMemo(
    () => visibleJobs.filter((job) => Boolean(job.pinnedAt) || Boolean(job.pinnedOutputIndices?.length)).length,
    [visibleJobs]
  );
  const pinnedImageCount = useMemo(
    () => visibleJobs.reduce((count, job) => count + (job.pinnedOutputIndices?.length ?? 0), 0),
    [visibleJobs]
  );
  const transientJobsCount = useMemo(
    () => visibleJobs.filter((job) => !job.lifecycle.isTerminal).length,
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
    warningJobIds: [] as string[],
    cancelingJobIds,
    deletingJobIds,
    pinningImageKeys,
    isInitialLoading,
    isPolling: isInitialLoading,
    error,
    handleNewSubmission,
    pollNow: async () => { if (fetchJobsRef.current) await fetchJobsRef.current(); },
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
