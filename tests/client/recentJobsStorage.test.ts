import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { RECENT_JOBS_HIDDEN_RETENTION_MS } from "../../src/shared/contracts/jobs";
import {
  clearRecentJobs,
  getRecentJob,
  hideRecentJob,
  hideJobOutputImage,
  hideJobOutputs,
  listVisibleRecentJobs,
  upsertRecentJob,
  pruneRecentJobs
} from "../../src/client/lib/recentJobsStorage";

function createJob(jobId: string, submittedAt: string) {
  return {
    jobId,
    endpointId: "endpoint-1",
    templateFingerprint: "fp-1",
    draftValues: { prompt: jobId },
    submittedInput: { workflow: { prompt: jobId } },
    lifecycle: {
      status: "IN_QUEUE",
      isTerminal: false,
      warning: null,
      failureReason: null
    },
    lastResponse: { id: jobId },
    lastError: null,
    submittedAt
  };
}

describe("recentJobsStorage", () => {
  beforeEach(async () => {
    await clearRecentJobs();
  });

  it("persists jobs newest-first and preserves provenance", async () => {
    await upsertRecentJob(createJob("job-old", "2026-05-23T10:00:00.000Z"));
    await upsertRecentJob(createJob("job-new", "2026-05-23T11:00:00.000Z"));

    const visible = await listVisibleRecentJobs();

    expect(visible.map((job) => job.jobId)).toEqual(["job-new", "job-old"]);
    expect(visible[0]?.provenance.templateFingerprint).toBe("fp-1");
  });

  it("supports one-way hide and prunes hidden rows after 24 hours", async () => {
    await upsertRecentJob(createJob("job-hide", "2026-05-23T10:00:00.000Z"));
    await hideRecentJob("job-hide", "2026-05-23T12:00:00.000Z");

    expect(await listVisibleRecentJobs()).toEqual([]);

    await pruneRecentJobs(new Date("2026-05-24T12:00:01.000Z").getTime() + RECENT_JOBS_HIDDEN_RETENTION_MS);

    expect(await getRecentJob("job-hide")).toBeNull();
  });

  it("hides a specific output image by index", async () => {
    await upsertRecentJob(createJob("job-img", "2026-05-23T10:00:00.000Z"));
    await hideJobOutputImage("job-img", 2);

    const job = await getRecentJob("job-img");
    expect(job?.hiddenOutputIndices).toEqual([2]);

    await hideJobOutputImage("job-img", 5);
    const updated = await getRecentJob("job-img");
    expect(updated?.hiddenOutputIndices).toEqual([2, 5]);
  });

  it("does not duplicate hidden indices when hiding the same image twice", async () => {
    await upsertRecentJob(createJob("job-dedup", "2026-05-23T10:00:00.000Z"));
    await hideJobOutputImage("job-dedup", 3);
    await hideJobOutputImage("job-dedup", 3);

    const job = await getRecentJob("job-dedup");
    expect(job?.hiddenOutputIndices).toEqual([3]);
  });

  it("marks all outputs as hidden with hideJobOutputs", async () => {
    await upsertRecentJob(createJob("job-all-hidden", "2026-05-23T10:00:00.000Z"));
    await hideJobOutputs("job-all-hidden");

    const job = await getRecentJob("job-all-hidden");
    expect(job?.outputsHidden).toBe(true);
  });
});