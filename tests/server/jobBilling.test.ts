import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { JobRecord } from "../../src/shared/contracts/jobs";

describe("terminal job billing", () => {
  let creditsDir: string;

  beforeEach(async () => {
    creditsDir = await mkdtemp(join(tmpdir(), "job-billing-"));
    process.env.CREDITS_DIR = creditsDir;
    process.env.JOBS_TMP_DIR = join(creditsDir, "jobs-tmp");
    process.env.JOBS_ARCHIVE_DIR = join(creditsDir, "archive");
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.CREDITS_DIR;
    delete process.env.JOBS_TMP_DIR;
    delete process.env.JOBS_ARCHIVE_DIR;
    vi.unstubAllGlobals();
    await rm(creditsDir, { recursive: true, force: true });
  });

  function job(startedAt: string | null): JobRecord {
    return {
      jobId: "job-1",
      displayName: "12345678",
      endpointId: "managed",
      workflowFileName: null,
      submittedAt: "2026-08-08T00:00:00.000Z",
      startedAt,
      completedAt: null,
      expiresAt: null,
      status: startedAt ? "IN_PROGRESS" : "IN_QUEUE",
      isTerminal: false,
      imageCount: 0,
      lastError: null,
      createdBy: "artist",
      billingMode: "managed",
      walletGroupId: "shared"
    };
  }

  async function fundWallet() {
    const { configureCreditAccount } = await import("../../src/server/lib/creditStore");
    await configureCreditAccount({
      username: "artist",
      walletGroupId: "shared",
      allowance: 10,
      refreshIntervalMs: 86_400_000,
      refreshingCredits: 10,
      staticCredits: 0,
      maxActiveJobs: 1,
      nextRefreshAt: "2099-01-01T00:00:00.000Z"
    });
  }

  it("settles queued cancellation for zero credits", async () => {
    await fundWallet();
    const { settleTerminalJobBilling } = await import("../../src/server/lib/jobBilling");

    expect(await settleTerminalJobBilling(job(null), "CANCELLED", "2026-08-08T00:00:30.000Z")).toMatchObject({
      creditsCharged: 0,
      executionTimeMs: 0
    });
  });

  it("charges elapsed execution and remains idempotent", async () => {
    await fundWallet();
    const { settleTerminalJobBilling } = await import("../../src/server/lib/jobBilling");
    const runningJob = job("2026-08-08T00:00:00.000Z");

    const first = await settleTerminalJobBilling(runningJob, "FAILED", "2026-08-08T00:00:10.001Z");
    const duplicate = await settleTerminalJobBilling(runningJob, "FAILED", "2026-08-08T00:00:20.000Z");

    expect(first).toMatchObject({ creditsCharged: 2, executionTimeMs: 10_001, alreadySettled: false });
    if (!duplicate) throw new Error("Expected duplicate settlement");
    expect(duplicate.alreadySettled).toBe(true);
    const { getCreditAccount } = await import("../../src/server/lib/creditStore");
    expect(await getCreditAccount("artist", "shared")).toMatchObject({ refreshingCredits: 8, staticCredits: 0 });
  });

  it("settles managed credits when polling reaches a terminal state", async () => {
    await fundWallet();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "FAILED",
      executionTime: 10_001
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const jobStore = await import("../../src/server/lib/jobStore");
    await jobStore.createJob(job("2026-08-08T00:00:00.000Z"), { draftValues: {}, submittedInput: {} });
    const { pollJobNow } = await import("../../src/server/lib/jobTracker");

    await pollJobNow("managed", "job-1", "rp_key");

    expect(await jobStore.readJob("job-1")).toMatchObject({
      isTerminal: true,
      status: "FAILED",
      executionTimeMs: 10_001,
      creditsCharged: 2
    });
    const { getCreditAccount } = await import("../../src/server/lib/creditStore");
    expect(await getCreditAccount("artist", "shared")).toMatchObject({ refreshingCredits: 8 });
  });
});