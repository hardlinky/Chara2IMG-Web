import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { statusBatchViaProxy } from "../../src/client/lib/api/runpodProxyClient";
import { clearRecentJobs, getRecentJob, upsertRecentJob } from "../../src/client/lib/recentJobsStorage";
import {
  JOB_OBSERVATION_TIMEOUT_MS,
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

  it("marks a long-running job as timed out without polling it again", async () => {
    const submittedAt = new Date(Date.now() - JOB_OBSERVATION_TIMEOUT_MS - 1000).toISOString();
    await upsertRecentJob(createJob("job-timeout", submittedAt));

    const result = classifyTimeoutLifecycle((await getRecentJob("job-timeout"))!);

    expect(result?.isTerminal).toBe(true);
    expect(result?.terminalReason).toBe("timed-out");

    const pollResult = await pollRecentJobsOnce({ apiKey: "key", endpointId: "endpoint-1" });
    expect(pollResult.warningJobIds).toEqual([]);
    expect(vi.mocked(statusBatchViaProxy)).not.toHaveBeenCalled();

    const stored = await getRecentJob("job-timeout");
    expect(stored?.lifecycle.isTerminal).toBe(true);
    expect(stored?.lifecycle.terminalReason).toBe("timed-out");
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