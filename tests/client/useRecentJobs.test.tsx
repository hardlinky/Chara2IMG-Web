import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { cancelViaProxy, statusBatchViaProxy, statusViaProxy } from "../../src/client/lib/api/runpodProxyClient";
import { clearRecentJobs, getRecentJob, listRecentJobs, upsertRecentJob } from "../../src/client/lib/recentJobsStorage";
import { buildLifecycleSnapshotFromStatus } from "../../src/client/features/jobs/jobStatus";
import {
  cancelRecentJob,
  filterJobsByStatus,
  getStoredStatusFilter,
  persistStatusFilter,
  pollSingleJob,
  pollRecentJobsOnce,
  resetStatusBatchPollingSupportForTests,
  removeRecentJobFromVisibleList,
  shouldDeferAdaptiveOffload,
  rerunRecentJobWithDependencies
} from "../../src/client/features/jobs/useRecentJobs";

vi.mock("../../src/client/lib/api/runpodProxyClient", () => ({
  statusViaProxy: vi.fn(),
  statusBatchViaProxy: vi.fn(),
  cancelViaProxy: vi.fn(),
  runViaProxy: vi.fn(),
  updateAppViaProxy: vi.fn()
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
    resetStatusBatchPollingSupportForTests();
    vi.mocked(cancelViaProxy).mockReset();
    vi.mocked(statusViaProxy).mockReset();
    vi.mocked(statusBatchViaProxy).mockReset();
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

  it("cancels queued jobs and persists the cancelled terminal state", async () => {
    await upsertRecentJob(createJob("job-cancel", "IN_QUEUE"));
    vi.mocked(cancelViaProxy).mockResolvedValueOnce({ id: "job-cancel", status: "CANCELLED" });

    await cancelRecentJob("job-cancel", { apiKey: "key", endpointId: "endpoint-1" });

    expect(vi.mocked(cancelViaProxy)).toHaveBeenCalledTimes(1);
    const stored = await getRecentJob("job-cancel");
    expect(stored?.lifecycle.isTerminal).toBe(true);
    expect(stored?.lifecycle.terminalReason).toBe("cancelled");
  });

  it("does not call cancel for terminal jobs", async () => {
    await upsertRecentJob(createJob("job-complete", "COMPLETED"));

    await cancelRecentJob("job-complete", { apiKey: "key", endpointId: "endpoint-1" });

    expect(vi.mocked(cancelViaProxy)).not.toHaveBeenCalled();
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
    await upsertRecentJob(createJob("job-hide", "IN_PROGRESS"));

    await removeRecentJobFromVisibleList("job-hide");

    const stored = await getRecentJob("job-hide");
    expect(stored).toBeNull();
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

  it("polls a single IN_PROGRESS job and updates its lifecycle without affecting other jobs", async () => {
    await upsertRecentJob(createJob("job-poll", "IN_PROGRESS"));
    await upsertRecentJob(createJob("job-other", "IN_QUEUE"));
    vi.mocked(statusViaProxy).mockResolvedValueOnce({ id: "job-poll", status: "COMPLETED" });

    const result = await pollSingleJob("job-poll", { apiKey: "key", endpointId: "endpoint-1" });

    expect(vi.mocked(statusViaProxy)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(statusViaProxy)).toHaveBeenCalledWith(expect.objectContaining({ id: "job-poll" }));

    const polled = result.jobs.find((job) => job.jobId === "job-poll");
    expect(polled?.lifecycle.status).toBe("COMPLETED");
    expect(polled?.lifecycle.isTerminal).toBe(true);

    const other = result.jobs.find((job) => job.jobId === "job-other");
    expect(other?.lifecycle.status).toBe("IN_QUEUE");
    expect(result.warningJobIds).toHaveLength(0);
  });

  it("polls queued aliases and normalizes them when updating lifecycle", async () => {
    await upsertRecentJob(createJob("job-queued-alias", "queued"));
    vi.mocked(statusViaProxy).mockResolvedValueOnce({ id: "job-queued-alias", status: "running" });

    const result = await pollSingleJob("job-queued-alias", { apiKey: "key", endpointId: "endpoint-1" });

    expect(vi.mocked(statusViaProxy)).toHaveBeenCalledTimes(1);

    const stored = result.jobs.find((job) => job.jobId === "job-queued-alias");
    expect(stored?.lifecycle.status).toBe("IN_PROGRESS");
    expect(stored?.lifecycle.isTerminal).toBe(false);
  });

  it("stores execution duration when status payload includes duration", async () => {
    await upsertRecentJob(createJob("job-duration", "IN_PROGRESS"));
    vi.mocked(statusViaProxy).mockResolvedValueOnce({
      id: "job-duration",
      status: "COMPLETED",
      duration: 2.4
    });

    const result = await pollSingleJob("job-duration", { apiKey: "key", endpointId: "endpoint-1" });
    const updated = result.jobs.find((job) => job.jobId === "job-duration");

    expect(updated?.lifecycle.status).toBe("COMPLETED");
    expect(updated?.lifecycle.executionTimeMs).toBe(2400);
  });

  it("adds a warning when the single job poll request fails with a non-404 error", async () => {
    await upsertRecentJob(createJob("job-warn", "IN_PROGRESS"));
    vi.mocked(statusViaProxy).mockRejectedValueOnce(new Error("Network error"));

    const result = await pollSingleJob("job-warn", { apiKey: "key", endpointId: "endpoint-1" });

    expect(result.warningJobIds).toContain("job-warn");
    const stored = await getRecentJob("job-warn");
    expect(stored?.lifecycle.status).toBe("IN_PROGRESS");
  });

  it("updates queued jobs from nested batch status payloads", async () => {
    await upsertRecentJob(createJob("job-batch", "IN_QUEUE"));

    vi.mocked(statusBatchViaProxy).mockResolvedValueOnce({
      items: [
        {
          id: "job-batch",
          ok: true,
          statusCode: 200,
          data: {
            data: {
              status: "running"
            }
          }
        }
      ]
    });

    const result = await pollRecentJobsOnce({ apiKey: "key", endpointId: "endpoint-1" });

    expect(vi.mocked(statusBatchViaProxy)).toHaveBeenCalledTimes(1);
    const updated = result.jobs.find((job) => job.jobId === "job-batch");
    expect(updated?.lifecycle.status).toBe("IN_PROGRESS");
    expect(updated?.lifecycle.isTerminal).toBe(false);
  });

  it("falls back to single-job polling when status-batch returns 404", async () => {
    await upsertRecentJob(createJob("job-fallback-1", "IN_QUEUE"));
    await upsertRecentJob(createJob("job-fallback-2", "IN_PROGRESS"));

    vi.mocked(statusBatchViaProxy).mockRejectedValueOnce({
      status: 404,
      message: "Not Found"
    });

    vi.mocked(statusViaProxy).mockImplementation(async (payload) => {
      if (payload.id === "job-fallback-1") {
        return { id: "job-fallback-1", status: "IN_PROGRESS" };
      }

      return { id: "job-fallback-2", status: "COMPLETED" };
    });

    const result = await pollRecentJobsOnce({ apiKey: "key", endpointId: "endpoint-1" });

    expect(vi.mocked(statusBatchViaProxy)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(statusViaProxy)).toHaveBeenCalledTimes(2);
    expect(result.warningJobIds).toHaveLength(0);

    const first = result.jobs.find((job) => job.jobId === "job-fallback-1");
    const second = result.jobs.find((job) => job.jobId === "job-fallback-2");
    expect(first?.lifecycle.status).toBe("IN_PROGRESS");
    expect(second?.lifecycle.status).toBe("COMPLETED");
    expect(second?.lifecycle.isTerminal).toBe(true);
  });

  it("stops retrying status-batch after a 404 capability miss", async () => {
    await upsertRecentJob(createJob("job-capability", "IN_QUEUE"));

    vi.mocked(statusBatchViaProxy).mockRejectedValueOnce({
      status: 404,
      message: "Not Found"
    });

    vi.mocked(statusViaProxy)
      .mockResolvedValueOnce({ id: "job-capability", status: "IN_PROGRESS" })
      .mockResolvedValueOnce({ id: "job-capability", status: "COMPLETED" });

    await pollRecentJobsOnce({ apiKey: "key", endpointId: "endpoint-1" });
    await pollRecentJobsOnce({ apiKey: "key", endpointId: "endpoint-1" });

    expect(vi.mocked(statusBatchViaProxy)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(statusViaProxy)).toHaveBeenCalledTimes(2);

    const stored = await getRecentJob("job-capability");
    expect(stored?.lifecycle.status).toBe("COMPLETED");
    expect(stored?.lifecycle.isTerminal).toBe(true);
  });
});