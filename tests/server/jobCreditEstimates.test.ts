import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { JobRecord } from "../../src/shared/contracts/jobs";

describe("job credit estimates", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "job-estimates-"));
    process.env.CREDITS_DIR = join(rootDir, "credits");
    process.env.JOBS_TMP_DIR = join(rootDir, "jobs-tmp");
    process.env.JOBS_ARCHIVE_DIR = join(rootDir, "archive");
    process.env.RUNPOD_ENDPOINT_ID = "managed";
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.CREDITS_DIR;
    delete process.env.JOBS_TMP_DIR;
    delete process.env.JOBS_ARCHIVE_DIR;
    delete process.env.RUNPOD_ENDPOINT_ID;
    vi.unstubAllGlobals();
    await rm(rootDir, { recursive: true, force: true });
  });

  function job(jobId: string, submittedAt: string, startedAt: string): JobRecord {
    return {
      jobId,
      displayName: jobId,
      endpointId: "managed",
      workflowFileName: null,
      submittedAt,
      startedAt,
      completedAt: null,
      expiresAt: null,
      status: "IN_PROGRESS",
      isTerminal: false,
      imageCount: 0,
      lastError: null,
      createdBy: "artist",
      billingMode: "managed",
      walletGroupId: "default",
      billingUsername: "artist"
    };
  }

  it("reserves green estimates for earlier concurrent jobs before later jobs", async () => {
    const { configureCreditAccount } = await import("../../src/server/lib/creditStore");
    const jobStore = await import("../../src/server/lib/jobStore");
    const { refreshManagedJobCreditEstimates } = await import("../../src/server/lib/jobCreditEstimates");
    await configureCreditAccount({
      username: "artist",
      walletGroupId: "default",
      allowance: 5,
      refreshIntervalMs: 86_400_000,
      refreshingCredits: 5,
      staticCredits: 20,
      maxActiveJobs: 2,
      nextRefreshAt: "2099-01-01T00:00:00.000Z"
    });
    await jobStore.createJob(job("job-early", "2026-08-08T00:00:00.000Z", "2026-08-08T00:00:00.000Z"), { draftValues: {}, submittedInput: {} });
    await jobStore.createJob(job("job-late", "2026-08-08T00:00:01.000Z", "2026-08-08T00:00:01.000Z"), { draftValues: {}, submittedInput: {} });

    await refreshManagedJobCreditEstimates("artist", "default", "managed", Date.parse("2026-08-08T00:00:30.001Z"));

    expect(await jobStore.readJob("job-early")).toMatchObject({
      estimatedCredits: 4,
      estimatedRefreshingCredits: 4,
      estimatedStaticCredits: 0
    });
    expect(await jobStore.readJob("job-late")).toMatchObject({
      estimatedCredits: 3,
      estimatedRefreshingCredits: 1,
      estimatedStaticCredits: 2
    });
  });

  it("updates persisted estimates when status polling runs", async () => {
    const { configureCreditAccount } = await import("../../src/server/lib/creditStore");
    const jobStore = await import("../../src/server/lib/jobStore");
    await configureCreditAccount({
      username: "artist",
      walletGroupId: "default",
      allowance: 5,
      refreshIntervalMs: 86_400_000,
      refreshingCredits: 5,
      staticCredits: 0,
      maxActiveJobs: 2,
      nextRefreshAt: "2099-01-01T00:00:00.000Z"
    });
    await jobStore.createJob(job("job-1", "2026-08-08T00:00:00.000Z", "2026-08-08T00:00:00.000Z"), { draftValues: {}, submittedInput: {} });
    vi.setSystemTime("2026-08-08T00:00:20.001Z");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "IN_PROGRESS" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })));
    const { pollJobNow } = await import("../../src/server/lib/jobTracker");

    await pollJobNow("managed", "job-1", "rp_key");

    expect(await jobStore.readJob("job-1")).toMatchObject({
      estimatedCredits: 3,
      estimatedRefreshingCredits: 3,
      estimatedStaticCredits: 0,
      creditEstimateUpdatedAt: "2026-08-08T00:00:20.001Z"
    });
  });
});