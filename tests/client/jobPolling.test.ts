import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { statusBatchViaProxy } from "../../src/client/lib/api/runpodProxyClient";
import { clearRecentJobs, getRecentJob, upsertRecentJob } from "../../src/client/lib/recentJobsStorage";
import {
  buildLifecycleSnapshotFromStatus,
  classifyKnownJob404Lifecycle,
  classifyTimeoutLifecycle,
} from "../../src/client/features/jobs/jobStatus";
import { pollRecentJobsOnce } from "../../src/client/features/jobs/useRecentJobs";

vi.mock("../../src/client/lib/api/runpodProxyClient", () => ({
  statusViaProxy: vi.fn(),
  statusBatchViaProxy: vi.fn(),
  cancelViaProxy: vi.fn(),
  runViaProxy: vi.fn(),
  updateAppViaProxy: vi.fn()
}));

function createJob(jobId: string, submittedAt: string) {
  return {
    jobId,
    endpointId: "endpoint-1",
    templateFingerprint: "fp-1",
    draftValues: { prompt: jobId },
    submittedInput: { workflow: { prompt: jobId } },
    lifecycle: buildLifecycleSnapshotFromStatus("IN_PROGRESS", submittedAt),
    lastResponse: { id: jobId },
    lastError: null,
    submittedAt
  };
}

describe("job polling", () => {
  beforeEach(async () => {
    await clearRecentJobs();
    vi.mocked(statusBatchViaProxy).mockReset();
  });

  it("does not apply client timeout and keeps polling long-running jobs", async () => {
    const submittedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await upsertRecentJob(createJob("job-timeout", submittedAt));

    const result = classifyTimeoutLifecycle((await getRecentJob("job-timeout"))!);
    expect(result).toBeNull();

    vi.mocked(statusBatchViaProxy).mockResolvedValueOnce({
      items: [
        {
          id: "job-timeout",
          ok: true,
          statusCode: 200,
          data: {
            id: "job-timeout",
            status: "IN_PROGRESS"
          }
        }
      ]
    });

    const pollResult = await pollRecentJobsOnce({ apiKey: "key", endpointId: "endpoint-1" });
    expect(pollResult.warningJobIds).toEqual([]);
    expect(vi.mocked(statusBatchViaProxy)).toHaveBeenCalledTimes(1);

    const stored = await getRecentJob("job-timeout");
    expect(stored?.lifecycle.isTerminal).toBe(false);
    expect(stored?.lifecycle.status).toBe("IN_PROGRESS");
  });

  it("classifies a 404 status lookup as expired-or-not-found", async () => {
    await upsertRecentJob(createJob("job-404", new Date().toISOString()));
    vi.mocked(statusBatchViaProxy).mockResolvedValueOnce({
      items: [
        {
          id: "job-404",
          ok: false,
          statusCode: 404,
          error: "missing"
        }
      ]
    });

    await pollRecentJobsOnce({ apiKey: "key", endpointId: "endpoint-1" });

    const stored = await getRecentJob("job-404");
    expect(stored?.lifecycle.isTerminal).toBe(true);
    expect(stored?.lifecycle.terminalReason).toBe("expired-or-not-found");
  });

  it("advances an active job to terminal on a successful status response", async () => {
    await upsertRecentJob(createJob("job-complete", new Date().toISOString()));
    vi.mocked(statusBatchViaProxy).mockResolvedValueOnce({
      items: [
        {
          id: "job-complete",
          ok: true,
          statusCode: 200,
          data: {
            id: "job-complete",
            status: "COMPLETED"
          }
        }
      ]
    });

    await pollRecentJobsOnce({ apiKey: "key", endpointId: "endpoint-1" });

    const stored = await getRecentJob("job-complete");
    expect(stored?.lifecycle.isTerminal).toBe(true);
    expect(stored?.lifecycle.status).toBe("COMPLETED");
  });
});