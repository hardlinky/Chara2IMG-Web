import "fake-indexeddb/auto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { clearRecentJobs, getRecentJob, listVisibleRecentJobs } from "../../src/client/lib/recentJobsStorage";
import { submitRunAndPersistRecentJob } from "../../src/client/lib/jobSubmission";

describe("app job submission", () => {
  beforeEach(async () => {
    await clearRecentJobs();
  });

  it("creates one recent-job record after a successful run submission", async () => {
    const submitRun = vi.fn(async () => ({
      id: "job-123",
      status: "IN_QUEUE",
      output: null
    }));

    await submitRunAndPersistRecentJob({
      endpointId: "endpoint-1",
      apiKey: "key",
      submittedInput: { workflow: { prompt: "hello" } },
      snapshot: {
        templateFingerprint: "fp-1",
        draftValues: { prompt: "hello" },
        submittedInput: { workflow: { prompt: "hello" } }
      },
      dependencies: {
        submitRun
      }
    });

    const visible = await listVisibleRecentJobs();
    const stored = await getRecentJob("job-123");

    expect(submitRun).toHaveBeenCalledTimes(1);
    expect(visible).toHaveLength(1);
    expect(stored?.provenance.templateFingerprint).toBe("fp-1");
    expect(stored?.provenance.draftValues).toEqual({ prompt: "hello" });
  });

  it("does not create a recent-job record when submission fails", async () => {
    const submitRun = vi.fn(async () => {
      throw new Error("submit failed");
    });

    await expect(
      submitRunAndPersistRecentJob({
        endpointId: "endpoint-1",
        apiKey: "key",
        submittedInput: { workflow: { prompt: "hello" } },
        snapshot: {
          templateFingerprint: "fp-1",
          draftValues: { prompt: "hello" },
          submittedInput: { workflow: { prompt: "hello" } }
        },
        dependencies: {
          submitRun
        }
      })
    ).rejects.toThrow("submit failed");

    expect(await listVisibleRecentJobs()).toEqual([]);
  });
});