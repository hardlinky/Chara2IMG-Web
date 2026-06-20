// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { clearRecentJobs, getRecentJob, listRecentJobs, upsertRecentJob } from "../../src/client/lib/recentJobsStorage";
import { buildLifecycleSnapshotFromStatus } from "../../src/client/features/jobs/jobStatus";
import {
  filterJobsByStatus,
  getStoredStatusFilter,
  persistStatusFilter,
  removeRecentJobFromVisibleList,
  shouldDeferAdaptiveOffload,
  rerunRecentJobWithDependencies,
  useRecentJobs,
} from "../../src/client/features/jobs/useRecentJobs";
import { listJobs, deleteJob } from "../../src/client/lib/api/jobsClient";
import type { RecentJobRecord } from "../../src/shared/contracts/jobs";

vi.mock("../../src/client/lib/api/jobsClient", () => ({
  listJobs: vi.fn(),
  getJob: vi.fn(),
  deleteJob: vi.fn(),
  adaptJobRecord: vi.fn(),
}));

vi.mock("../../src/client/lib/api/runpodProxyClient", () => ({
  statusViaProxy: vi.fn(),
  statusBatchViaProxy: vi.fn(),
  cancelViaProxy: vi.fn(),
  runViaProxy: vi.fn(),
  updateAppViaProxy: vi.fn(),
}));

vi.mock("../../src/client/lib/imageCache", () => ({
  pruneExpiredImageCache: vi.fn().mockResolvedValue(undefined),
}));

function createJob(jobId: string, status: string) {
  return {
    jobId,
    endpointId: "endpoint-1",
    templateFingerprint: "fp-1",
    workflowFileName: "workflow-a.json",
    draftValues: { prompt: jobId },
    submittedInput: { workflow: { prompt: jobId } },
    lifecycle: buildLifecycleSnapshotFromStatus(status),
    lastResponse: { id: jobId },
    lastError: null,
    submittedAt: new Date().toISOString()
  };
}

describe("useRecentJobs helpers", () => {
  beforeEach(async () => {
    await clearRecentJobs();
    vi.mocked(deleteJob).mockReset();
    vi.mocked(listJobs).mockReset();
    let storedFilter: string | null = null;
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(() => storedFilter),
        setItem: vi.fn((_key, value) => {
          storedFilter = value;
        }),
        removeItem: vi.fn(() => {
          storedFilter = null;
        }),
        clear: vi.fn(() => {
          storedFilter = null;
        }),
        key: vi.fn(() => null),
        length: 0
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defers adaptive output offload for one hour after completion", () => {
    const completedAt = "2026-05-23T10:00:00.000Z";

    expect(
      shouldDeferAdaptiveOffload(
        {
          submittedAt: completedAt,
          hiddenAt: null,
          lifecycle: buildLifecycleSnapshotFromStatus("COMPLETED", completedAt),
        },
        new Date("2026-05-23T10:59:59.000Z").getTime()
      )
    ).toBe(true);

    expect(
      shouldDeferAdaptiveOffload(
        {
          submittedAt: completedAt,
          hiddenAt: null,
          lifecycle: buildLifecycleSnapshotFromStatus("COMPLETED", completedAt),
        },
        new Date("2026-05-23T11:00:01.000Z").getTime()
      )
    ).toBe(false);
  });

  it("deletes jobs when removed from the visible list", async () => {
    vi.mocked(deleteJob).mockResolvedValueOnce(undefined);
    await removeRecentJobFromVisibleList("job-hide");
    expect(vi.mocked(deleteJob)).toHaveBeenCalledWith("job-hide");
  });

  it("reruns a prior job as a new submission using the saved payload input", async () => {
    await upsertRecentJob({ ...createJob("job-rerun", "FAILED"), submittedAt: "2026-05-23T10:00:00.000Z" });
    let submittedJobId = "";

    const result = await rerunRecentJobWithDependencies(
      "job-rerun",
      { apiKey: "key", endpointId: "endpoint-1" },
      {
        submitRunAndPersistRecentJob: async (args) => {
          submittedJobId = args.submittedInput.workflow ? "job-rerun-copy" : "";
          await upsertRecentJob({
            jobId: "job-rerun-copy",
            endpointId: args.endpointId,
            templateFingerprint: args.snapshot.templateFingerprint,
            workflowFileName: args.snapshot.workflowFileName,
            draftValues: args.snapshot.draftValues,
            submittedInput: args.snapshot.submittedInput,
            lifecycle: buildLifecycleSnapshotFromStatus("IN_QUEUE"),
            lastResponse: { id: "job-rerun-copy" },
            lastError: null,
            submittedAt: "2026-05-23T10:01:00.000Z"
          });
          return { id: "job-rerun-copy", status: "IN_QUEUE" };
        }
      }
    );

    expect(result?.jobId).toBe("job-rerun");
    expect(submittedJobId).toBe("job-rerun-copy");
    expect((await listRecentJobs()).map((job) => job.jobId)).toEqual(["job-rerun-copy", "job-rerun"]);
    expect((await getRecentJob("job-rerun-copy"))?.provenance.workflowFileName).toBe("workflow-a.json");
  });

  it("persists and restores the last-used status filter", () => {
    persistStatusFilter("FAILED");
    expect(getStoredStatusFilter()).toBe("FAILED");
  });

  it("filters jobs by status for the visible page state", async () => {
    expect(filterJobsByStatus([
      {
        jobId: "job-a",
        endpointId: "endpoint-1",
        submittedAt: "2026-05-23T10:00:00.000Z",
        hiddenAt: null,
        lifecycle: buildLifecycleSnapshotFromStatus("IN_QUEUE"),
        provenance: {
          templateFingerprint: "fp-1",
          draftValues: {},
          submittedInput: {}
        },
        lastResponse: null,
        lastError: null
      },
      {
        jobId: "job-b",
        endpointId: "endpoint-1",
        submittedAt: "2026-05-23T11:00:00.000Z",
        hiddenAt: null,
        lifecycle: buildLifecycleSnapshotFromStatus("FAILED"),
        provenance: {
          templateFingerprint: "fp-1",
          draftValues: {},
          submittedInput: {}
        },
        lastResponse: null,
        lastError: null
      }
    ], "FAILED").map((job) => job.jobId)).toEqual(["job-b"]);
  });
});

describe("useRecentJobs hook", () => {
  function makeJob(jobId: string, status: string): RecentJobRecord {
    return {
      jobId,
      endpointId: "endpoint-1",
      submittedAt: "2026-06-01T00:00:00.000Z",
      hiddenAt: null,
      pinnedAt: null,
      lifecycle: {
        status,
        isTerminal: ["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(status),
        terminalReason: undefined,
        lastCheckedAt: undefined,
        finishedAt: undefined,
        warning: null,
        executionTimeMs: undefined,
        failureReason: null,
      },
      provenance: { templateFingerprint: "", workflowFileName: "wf.json", draftValues: {}, submittedInput: {} },
      lastResponse: null,
      lastError: null,
      outputImageCount: 0,
      hiddenOutputIndices: [],
      outputsHidden: false,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(listJobs).mockReset();
    vi.mocked(deleteJob).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("isInitialLoading starts true and becomes false after first poll", async () => {
    vi.mocked(listJobs).mockResolvedValue([]);

    const { result } = renderHook(() => useRecentJobs());
    expect(result.current.isInitialLoading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.isInitialLoading).toBe(false);
    expect(vi.mocked(listJobs)).toHaveBeenCalledTimes(1);
  });

  it("jobs are populated from listJobs response", async () => {
    vi.mocked(listJobs).mockResolvedValue([makeJob("job-1", "IN_QUEUE")]);

    const { result } = renderHook(() => useRecentJobs());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.visibleJobs).toHaveLength(1);
    expect(result.current.visibleJobs[0]?.jobId).toBe("job-1");
  });

  it("re-fetches jobs after 10 seconds", async () => {
    vi.mocked(listJobs).mockResolvedValue([]);

    renderHook(() => useRecentJobs());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const callsAfterInit = vi.mocked(listJobs).mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(vi.mocked(listJobs).mock.calls.length).toBeGreaterThan(callsAfterInit);
  });

  it("delete calls deleteJob and removes job from list", async () => {
    vi.mocked(listJobs).mockResolvedValue([makeJob("job-del", "COMPLETED")]);
    vi.mocked(deleteJob).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useRecentJobs());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.visibleJobs).toHaveLength(1);

    await act(async () => {
      await result.current.removeVisibleJob("job-del");
    });

    expect(vi.mocked(deleteJob)).toHaveBeenCalledWith("job-del");
    expect(result.current.visibleJobs).toHaveLength(0);
  });

  it("delete button re-enabled after server error", async () => {
    vi.mocked(listJobs).mockResolvedValue([makeJob("job-err", "COMPLETED")]);
    vi.mocked(deleteJob).mockRejectedValueOnce(new Error("server error"));

    const { result } = renderHook(() => useRecentJobs());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    await act(async () => {
      await result.current.removeVisibleJob("job-err").catch(() => undefined);
    });

    // Job should still be in the list (not removed on error)
    expect(result.current.visibleJobs).toHaveLength(1);
    // deletingJobIds should be empty (re-enabled)
    expect(result.current.deletingJobIds.has("job-err")).toBe(false);
  });
});

describe("removeRecentJobFromVisibleList", () => {
  beforeEach(() => {
    vi.mocked(deleteJob).mockReset();
  });

  it("calls deleteJob with the provided jobId", async () => {
    vi.mocked(deleteJob).mockResolvedValueOnce(undefined);
    await removeRecentJobFromVisibleList("job-to-delete");
    expect(vi.mocked(deleteJob)).toHaveBeenCalledWith("job-to-delete");
  });
});