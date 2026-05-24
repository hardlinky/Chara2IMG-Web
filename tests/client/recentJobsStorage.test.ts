import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { RECENT_JOBS_HIDDEN_RETENTION_MS } from "../../src/shared/contracts/jobs";
import {
  clearRecentJobs,
  getRecentJob,
  hideRecentJob,
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
});