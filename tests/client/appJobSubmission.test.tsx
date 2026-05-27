import "fake-indexeddb/auto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { clearRecentJobs, getRecentJob, listVisibleRecentJobs, upsertRecentJob } from "../../src/client/lib/recentJobsStorage";
import { buildLifecycleSnapshotFromStatus } from "../../src/client/features/jobs/jobStatus";
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
        workflowFileName: "workflow-a.json",
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
    expect(stored?.provenance.workflowFileName).toBe("workflow-a.json");
    expect(stored?.provenance.draftValues).toEqual({ prompt: "hello" });
  });

  it("normalizes queued aliases to IN_QUEUE when persisting lifecycle state", async () => {
    const submitRun = vi.fn(async () => ({
      id: "job-queued",
      status: "queued",
      output: null
    }));

    await submitRunAndPersistRecentJob({
      endpointId: "endpoint-1",
      apiKey: "key",
      submittedInput: { workflow: { prompt: "hello" } },
      snapshot: {
        templateFingerprint: "fp-1",
        workflowFileName: "workflow-a.json",
        draftValues: { prompt: "hello" },
        submittedInput: { workflow: { prompt: "hello" } }
      },
      dependencies: {
        submitRun
      }
    });

    const stored = await getRecentJob("job-queued");
    expect(stored?.lifecycle.status).toBe("IN_QUEUE");
    expect(stored?.lifecycle.isTerminal).toBe(false);
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
          workflowFileName: "workflow-a.json",
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

  it("keeps legacy records without workflow filename readable", async () => {
    await upsertRecentJob({
      jobId: "legacy-job",
      endpointId: "endpoint-1",
      templateFingerprint: "fp-legacy",
      draftValues: { prompt: "legacy" },
      submittedInput: { workflow: { prompt: "legacy" } },
      lifecycle: buildLifecycleSnapshotFromStatus("COMPLETED"),
      lastResponse: { id: "legacy-job", status: "COMPLETED" },
      lastError: null
    });

    const stored = await getRecentJob("legacy-job");
    expect(stored?.provenance.templateFingerprint).toBe("fp-legacy");
    expect(stored?.provenance.workflowFileName).toBeUndefined();
  });
});