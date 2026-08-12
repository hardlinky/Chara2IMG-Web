import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpDir: string;
let archiveDir: string;

describe("submission capacity", () => {
  beforeEach(async () => {
    process.env.RUNPOD_GLOBAL_CONCURRENCY = "2";
    tmpDir = await mkdtemp(join(tmpdir(), "submission-capacity-tmp-"));
    archiveDir = await mkdtemp(join(tmpdir(), "submission-capacity-archive-"));
    process.env.JOBS_TMP_DIR = tmpDir;
    process.env.JOBS_ARCHIVE_DIR = archiveDir;
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.RUNPOD_GLOBAL_CONCURRENCY;
    delete process.env.JOBS_TMP_DIR;
    delete process.env.JOBS_ARCHIVE_DIR;
    await rm(tmpDir, { recursive: true, force: true });
    await rm(archiveDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("allows a fourth job when three active jobs are already in flight and capacity is four", async () => {
    process.env.RUNPOD_GLOBAL_CONCURRENCY = "20";
    const { reserveSubmissionCapacity } = await import("../../src/server/lib/submissionCapacity");
    const jobStore = await import("../../src/server/lib/jobStore");

    await Promise.all([
      jobStore.createJob({
        jobId: "live-job-1",
        displayName: "11111111",
        endpointId: "endpoint",
        workflowFileName: null,
        submittedAt: "2026-08-08T00:00:00.000Z",
        startedAt: "2026-08-08T00:00:01.000Z",
        completedAt: null,
        expiresAt: null,
        status: "IN_PROGRESS",
        isTerminal: false,
        imageCount: 0,
        lastError: null,
        createdBy: "artist",
        billingMode: "managed",
        walletGroupId: "shared",
        billingUsername: "artist"
      }, { draftValues: {}, submittedInput: {} }),
      jobStore.createJob({
        jobId: "live-job-2",
        displayName: "22222222",
        endpointId: "endpoint",
        workflowFileName: null,
        submittedAt: "2026-08-08T00:00:00.000Z",
        startedAt: "2026-08-08T00:00:01.000Z",
        completedAt: null,
        expiresAt: null,
        status: "IN_PROGRESS",
        isTerminal: false,
        imageCount: 0,
        lastError: null,
        createdBy: "artist",
        billingMode: "managed",
        walletGroupId: "shared",
        billingUsername: "artist"
      }, { draftValues: {}, submittedInput: {} }),
      jobStore.createJob({
        jobId: "live-job-3",
        displayName: "33333333",
        endpointId: "endpoint",
        workflowFileName: null,
        submittedAt: "2026-08-08T00:00:00.000Z",
        startedAt: "2026-08-08T00:00:01.000Z",
        completedAt: null,
        expiresAt: null,
        status: "IN_PROGRESS",
        isTerminal: false,
        imageCount: 0,
        lastError: null,
        createdBy: "artist",
        billingMode: "managed",
        walletGroupId: "shared",
        billingUsername: "artist"
      }, { draftValues: {}, submittedInput: {} })
    ]);

    const result = await reserveSubmissionCapacity({ username: "artist", walletGroupId: "shared", maxWalletActiveJobs: 4, createdAt: Date.now() });
    expect(result).toEqual({ ok: true, reservationId: expect.any(String) });
  });

  it("does not double-count active jobs that already have live reservations", async () => {
    process.env.RUNPOD_GLOBAL_CONCURRENCY = "20";
    const { attachReservationJobId, reserveSubmissionCapacity } = await import("../../src/server/lib/submissionCapacity");
    const jobStore = await import("../../src/server/lib/jobStore");

    await Promise.all([
      jobStore.createJob({
        jobId: "live-job-1",
        displayName: "11111111",
        endpointId: "endpoint",
        workflowFileName: null,
        submittedAt: "2026-08-08T00:00:00.000Z",
        startedAt: "2026-08-08T00:00:01.000Z",
        completedAt: null,
        expiresAt: null,
        status: "IN_PROGRESS",
        isTerminal: false,
        imageCount: 0,
        lastError: null,
        createdBy: "artist",
        billingMode: "managed",
        walletGroupId: "shared",
        billingUsername: "artist"
      }, { draftValues: {}, submittedInput: {} }),
      jobStore.createJob({
        jobId: "live-job-2",
        displayName: "22222222",
        endpointId: "endpoint",
        workflowFileName: null,
        submittedAt: "2026-08-08T00:00:00.000Z",
        startedAt: "2026-08-08T00:00:01.000Z",
        completedAt: null,
        expiresAt: null,
        status: "IN_PROGRESS",
        isTerminal: false,
        imageCount: 0,
        lastError: null,
        createdBy: "artist",
        billingMode: "managed",
        walletGroupId: "shared",
        billingUsername: "artist"
      }, { draftValues: {}, submittedInput: {} }),
      jobStore.createJob({
        jobId: "live-job-3",
        displayName: "33333333",
        endpointId: "endpoint",
        workflowFileName: null,
        submittedAt: "2026-08-08T00:00:00.000Z",
        startedAt: "2026-08-08T00:00:01.000Z",
        completedAt: null,
        expiresAt: null,
        status: "IN_PROGRESS",
        isTerminal: false,
        imageCount: 0,
        lastError: null,
        createdBy: "artist",
        billingMode: "managed",
        walletGroupId: "shared",
        billingUsername: "artist"
      }, { draftValues: {}, submittedInput: {} })
    ]);

    const reservationA = await reserveSubmissionCapacity({ username: "artist", walletGroupId: "shared", maxWalletActiveJobs: 6, createdAt: Date.now() });
    if (!reservationA.ok) throw new Error("Expected reservation A");
    attachReservationJobId(reservationA.reservationId, "live-job-1");

    const reservationB = await reserveSubmissionCapacity({ username: "artist", walletGroupId: "shared", maxWalletActiveJobs: 6, createdAt: Date.now() });
    if (!reservationB.ok) throw new Error("Expected reservation B");
    attachReservationJobId(reservationB.reservationId, "live-job-2");

    const reservationC = await reserveSubmissionCapacity({ username: "artist", walletGroupId: "shared", maxWalletActiveJobs: 6, createdAt: Date.now() });
    if (!reservationC.ok) throw new Error("Expected reservation C");
    attachReservationJobId(reservationC.reservationId, "live-job-3");

    expect(await reserveSubmissionCapacity({ username: "artist", walletGroupId: "shared", maxWalletActiveJobs: 6, createdAt: Date.now() })).toMatchObject({ ok: true });
  });

  it("reserves no more than the global polling capacity", async () => {
    const { reserveSubmissionCapacity } = await import("../../src/server/lib/submissionCapacity");

    expect(await reserveSubmissionCapacity({ username: "a", walletGroupId: null, maxWalletActiveJobs: null, createdAt: Date.now() })).toMatchObject({ ok: true });
    expect(await reserveSubmissionCapacity({ username: "b", walletGroupId: null, maxWalletActiveJobs: null, createdAt: Date.now() })).toMatchObject({ ok: true });
    expect(await reserveSubmissionCapacity({ username: "c", walletGroupId: null, maxWalletActiveJobs: null, createdAt: Date.now() })).toEqual({
      ok: false,
      reason: "global-capacity"
    });
  });

  it("applies wallet capacity across endpoints sharing a wallet group", async () => {
    const { reserveSubmissionCapacity } = await import("../../src/server/lib/submissionCapacity");
    const jobStore = await import("../../src/server/lib/jobStore");

    await jobStore.createJob({
      jobId: "wallet-limited-job",
      displayName: "abc12345",
      endpointId: "endpoint",
      workflowFileName: null,
      submittedAt: "2026-08-08T00:00:00.000Z",
      startedAt: "2026-08-08T00:00:01.000Z",
      completedAt: null,
      expiresAt: null,
      status: "IN_PROGRESS",
      isTerminal: false,
      imageCount: 0,
      lastError: null,
      createdBy: "artist",
      billingMode: "managed",
      walletGroupId: "shared",
      billingUsername: "artist"
    }, { draftValues: {}, submittedInput: {} });

    expect(await reserveSubmissionCapacity({ username: "artist", walletGroupId: "shared", maxWalletActiveJobs: 1, createdAt: Date.now() })).toEqual({
      ok: false,
      reason: "wallet-capacity"
    });
    expect((await reserveSubmissionCapacity({ username: "other", walletGroupId: "shared", maxWalletActiveJobs: 1, createdAt: Date.now() })).ok).toBe(true);
  });

  it("releases failed submissions and terminal jobs", async () => {
    const { releaseSubmissionCapacity, reserveSubmissionCapacity } = await import("../../src/server/lib/submissionCapacity");

    const first = await reserveSubmissionCapacity({ username: "artist", walletGroupId: "shared", maxWalletActiveJobs: 1, createdAt: Date.now() });
    if (!first.ok) throw new Error("Expected reservation");
    releaseSubmissionCapacity(first.reservationId);

    expect((await reserveSubmissionCapacity({ username: "artist", walletGroupId: "shared", maxWalletActiveJobs: 1, createdAt: Date.now() })).ok).toBe(true);
  });

  it("does not apply wallet capacity to unknown endpoints", async () => {
    const { reserveSubmissionCapacity } = await import("../../src/server/lib/submissionCapacity");

    expect((await reserveSubmissionCapacity({ username: "artist", walletGroupId: null, maxWalletActiveJobs: null, createdAt: Date.now() })).ok).toBe(true);
    expect((await reserveSubmissionCapacity({ username: "artist", walletGroupId: null, maxWalletActiveJobs: null, createdAt: Date.now() })).ok).toBe(true);
  });


});