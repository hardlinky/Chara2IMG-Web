import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("job tracker output validation", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "job-tracker-output-"));
    process.env.JOBS_TMP_DIR = join(rootDir, "jobs-tmp");
    process.env.JOBS_ARCHIVE_DIR = join(rootDir, "archive");
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.JOBS_TMP_DIR;
    delete process.env.JOBS_ARCHIVE_DIR;
    vi.unstubAllGlobals();
    await rm(rootDir, { recursive: true, force: true });
  });

  it("records a completed image job with zero images as failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "COMPLETED",
      output: []
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const jobStore = await import("../../src/server/lib/jobStore");
    await jobStore.createJob({
      jobId: "empty-output-job",
      displayName: "12345678",
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
      createdBy: null,
      billingMode: "free",
      walletGroupId: null,
      billingUsername: "anonymous"
    }, { draftValues: {}, submittedInput: {} });
    const { pollJobNow } = await import("../../src/server/lib/jobTracker");

    await pollJobNow("endpoint", "empty-output-job", "rp_key");

    expect(await jobStore.readJob("empty-output-job")).toMatchObject({
      status: "FAILED",
      isTerminal: true,
      terminalReason: "failed",
      imageCount: 0,
      lastError: "Workflow completed without producing any images."
    });
  });

  it("keeps a completed job successful when an image is persisted", async () => {
    const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WvJwAAAAASUVORK5CYII=";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "COMPLETED",
      output: { images: [{ image: tinyPng }] }
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const jobStore = await import("../../src/server/lib/jobStore");
    await jobStore.createJob({
      jobId: "image-output-job",
      displayName: "87654321",
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
      createdBy: null,
      billingMode: "free",
      walletGroupId: null,
      billingUsername: "anonymous"
    }, { draftValues: {}, submittedInput: {} });
    const { pollJobNow } = await import("../../src/server/lib/jobTracker");

    await pollJobNow("endpoint", "image-output-job", "rp_key");

    expect(await jobStore.readJob("image-output-job")).toMatchObject({
      status: "COMPLETED",
      isTerminal: true,
      terminalReason: "completed",
      imageCount: 1,
      lastError: null
    });
  });

  it("reconciles a stale active job once it has finished on RunPod", async () => {
    process.env.SERVER_RUNPOD_API_KEY = "server-key";
    process.env.RUNPOD_ENDPOINT_ID = "endpoint";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "COMPLETED",
      output: { images: [{ image: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WvJwAAAAASUVORK5CYII=" }] }
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const jobStore = await import("../../src/server/lib/jobStore");
    const { reconcileStaleActiveJob } = await import("../../src/server/lib/jobTracker");

    await jobStore.createJob({
      jobId: "stale-job",
      displayName: "deadbeef",
      endpointId: "endpoint",
      workflowFileName: null,
      submittedAt: "2020-01-01T00:00:00.000Z",
      startedAt: "2020-01-01T00:00:01.000Z",
      completedAt: null,
      expiresAt: null,
      status: "IN_PROGRESS",
      isTerminal: false,
      imageCount: 0,
      lastError: null,
      createdBy: null,
      billingMode: "free",
      walletGroupId: null,
      billingUsername: "anonymous"
    }, { draftValues: {}, submittedInput: {} });

    const existing = await jobStore.readJob("stale-job");
    if (!existing) {
      throw new Error("Expected stale job to exist after createJob");
    }

    const updated = await reconcileStaleActiveJob(existing);

    expect(updated).toMatchObject({
      status: "COMPLETED",
      isTerminal: true,
      terminalReason: "completed",
      imageCount: 1,
    });
  });
});