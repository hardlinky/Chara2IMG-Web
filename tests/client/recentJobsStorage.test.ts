import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { RECENT_JOBS_HIDDEN_RETENTION_MS } from "../../src/shared/contracts/jobs";
import {
  clearRecentJobs,
  getRecentJob,
  hideRecentJob,
  hideJobOutputs,
  listRecentJobs,
  listVisibleRecentJobs,
  removeRecentJobOutputImage,
  setRecentJobOutputPinned,
  upsertRecentJob,
  pruneRecentJobs
} from "../../src/client/lib/recentJobsStorage";

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WvJwAAAAASUVORK5CYII=";
const tinyGifBase64 = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

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

function createJobWithImages(jobId: string, submittedAt: string) {
  return {
    ...createJob(jobId, submittedAt),
    lastResponse: {
      output: {
        images: [{ image: tinyPngBase64 }, { image: `data:image/gif;base64,${tinyGifBase64}` }]
      }
    }
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

  it("removes a specific output image from lastResponse while preserving valid JSON", async () => {
    await upsertRecentJob(createJobWithImages("job-img", "2026-05-23T10:00:00.000Z"));
    await removeRecentJobOutputImage("job-img", 0);

    const job = await getRecentJob("job-img");
    const images = (job?.lastResponse as { output?: { images?: Array<{ image: string }> } } | null)?.output?.images ?? [];

    expect(images).toHaveLength(1);
    expect(images[0]?.image).toBe(`data:image/gif;base64,${tinyGifBase64}`);
    expect(job?.hiddenOutputIndices).toBeUndefined();
    expect(() => JSON.parse(JSON.stringify(job?.lastResponse))).not.toThrow();
  });

  it("no-ops when removing an out-of-range image index", async () => {
    await upsertRecentJob(createJobWithImages("job-oob", "2026-05-23T10:00:00.000Z"));
    await removeRecentJobOutputImage("job-oob", 9);

    const job = await getRecentJob("job-oob");
    const images = (job?.lastResponse as { output?: { images?: Array<{ image: string }> } } | null)?.output?.images ?? [];
    expect(images).toHaveLength(2);
  });

  it("marks all outputs as hidden with hideJobOutputs", async () => {
    await upsertRecentJob(createJob("job-all-hidden", "2026-05-23T10:00:00.000Z"));
    await hideJobOutputs("job-all-hidden");

    const job = await getRecentJob("job-all-hidden");
    expect(job?.outputsHidden).toBe(true);
    expect(job?.hiddenAt).not.toBeNull();
    expect((await listVisibleRecentJobs()).find((item) => item.jobId === "job-all-hidden")).toBeUndefined();
  });

  it("hides a job from all lists when its final output image is removed", async () => {
    await upsertRecentJob({
      ...createJobWithImages("job-last-image", "2026-05-23T10:00:00.000Z"),
      lastResponse: {
        output: {
          images: [{ image: tinyPngBase64 }]
        }
      }
    });

    await removeRecentJobOutputImage("job-last-image", 0);

    const job = await getRecentJob("job-last-image");
    expect(job?.outputsHidden).toBe(true);
    expect(job?.hiddenAt).not.toBeNull();
    expect((await listVisibleRecentJobs()).find((item) => item.jobId === "job-last-image")).toBeUndefined();
  });

  it("keeps only the 10 most recent unpinned jobs", async () => {
    for (let index = 0; index < 12; index += 1) {
      await upsertRecentJob(createJob(`job-${index}`, `2026-05-23T10:${String(index).padStart(2, "0")}:00.000Z`));
    }

    const jobs = await listRecentJobs();
    expect(jobs).toHaveLength(10);
    expect(jobs[0]?.jobId).toBe("job-11");
    expect(jobs[9]?.jobId).toBe("job-2");
  });

  it("keeps pinned jobs while pruning oldest unpinned jobs", async () => {
    for (let index = 0; index < 10; index += 1) {
      await upsertRecentJob(createJob(`job-${index}`, `2026-05-23T10:${String(index).padStart(2, "0")}:00.000Z`));
    }

    const pinResult = await setRecentJobOutputPinned("job-0", 0, true, "2026-05-23T11:00:00.000Z");
    expect(pinResult).toEqual({ ok: true });

    await upsertRecentJob(createJob("job-10", "2026-05-23T10:10:00.000Z"));

    const jobs = await listRecentJobs();
    expect(jobs).toHaveLength(11);
    expect(jobs.find((job) => job.jobId === "job-0")?.pinnedAt).toBeTruthy();
    expect(jobs.find((job) => job.jobId === "job-1")).toBeDefined();

    await upsertRecentJob(createJob("job-11", "2026-05-23T10:11:00.000Z"));
    const afterSecondSubmission = await listRecentJobs();
    expect(afterSecondSubmission).toHaveLength(11);
    expect(afterSecondSubmission.find((job) => job.jobId === "job-1")).toBeUndefined();
  });

  it("allows pinning more than 10 jobs while still enforcing unpinned retention", async () => {
    for (let index = 0; index < 14; index += 1) {
      await upsertRecentJob(createJob(`job-pin-${index}`, `2026-05-23T12:${String(index).padStart(2, "0")}:00.000Z`));
      const result = await setRecentJobOutputPinned(`job-pin-${index}`, 0, true);
      expect(result).toEqual({ ok: true });
    }

    const jobs = await listRecentJobs();
    expect(jobs).toHaveLength(14);
    expect(jobs.filter((job) => Boolean(job.pinnedOutputIndices?.length))).toHaveLength(14);
  });

  it("after unpinning all, next submission prunes oldest unpinned jobs down to 10", async () => {
    for (let index = 0; index < 10; index += 1) {
      await upsertRecentJob(createJob(`job-a-${index}`, `2026-05-23T13:${String(index).padStart(2, "0")}:00.000Z`));
      const pinResult = await setRecentJobOutputPinned(`job-a-${index}`, 0, true);
      expect(pinResult).toEqual({ ok: true });
    }

    for (let index = 10; index < 20; index += 1) {
      await upsertRecentJob(createJob(`job-a-${index}`, `2026-05-23T13:${String(index).padStart(2, "0")}:00.000Z`));
    }

    for (let index = 0; index < 10; index += 1) {
      const unpinResult = await setRecentJobOutputPinned(`job-a-${index}`, 0, false);
      expect(unpinResult).toEqual({ ok: true });
    }

    const afterUnpin = await listRecentJobs();
    expect(afterUnpin.filter((job) => job.hiddenAt === null && !job.pinnedAt)).toHaveLength(20);

    await upsertRecentJob(createJob("job-a-20", "2026-05-23T13:20:00.000Z"));

    const afterRun = await listRecentJobs();
    expect(afterRun).toHaveLength(10);
    expect(afterRun[0]?.jobId).toBe("job-a-20");
    expect(afterRun[9]?.jobId).toBe("job-a-11");
  });
});