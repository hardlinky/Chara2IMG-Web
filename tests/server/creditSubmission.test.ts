import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function cookieFrom(response: Response): string {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

describe("credit-aware RunPod submission", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "credit-submission-"));
    process.env.CREDITS_DIR = join(rootDir, "credits");
    process.env.JOBS_TMP_DIR = join(rootDir, "jobs-tmp");
    process.env.JOBS_ARCHIVE_DIR = join(rootDir, "archive");
    process.env.INVITE_SECRET = "invite-test";
    process.env.COOKIE_SECRET = "cookie-secret-test";
    process.env.ALLOWED_ORIGIN = "http://localhost:5173";
    process.env.RUNPOD_ENDPOINT_ID = "managed-endpoint";
    process.env.SERVER_RUNPOD_API_KEY = "rp_server_key";
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })));
  });

  afterEach(async () => {
    delete process.env.CREDITS_DIR;
    delete process.env.JOBS_TMP_DIR;
    delete process.env.JOBS_ARCHIVE_DIR;
    delete process.env.INVITE_SECRET;
    delete process.env.COOKIE_SECRET;
    delete process.env.ALLOWED_ORIGIN;
    delete process.env.RUNPOD_ENDPOINT_ID;
    delete process.env.SERVER_RUNPOD_API_KEY;
    vi.unstubAllGlobals();
    await rm(rootDir, { recursive: true, force: true });
  });

  async function createInvitedApp() {
    const { createServerApp } = await import("../../src/server/index");
    const app = createServerApp();
    const invite = await app.request("http://localhost/api/access/verify-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
      body: JSON.stringify({ invite: "invite-test" })
    });
    return { app, cookie: cookieFrom(invite) };
  }

  async function submit(app: Awaited<ReturnType<typeof createInvitedApp>>["app"], cookie: string, endpointId: string) {
    return app.request("http://localhost/api/runpod/run", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "http://localhost:5173" },
      body: JSON.stringify({ endpointId, apiKey: "rp_user_key", input: { prompt: "hello" } })
    });
  }

  it("rejects a managed submission with no credits before forwarding", async () => {
    const { app, cookie } = await createInvitedApp();

    const response = await submit(app, cookie, "managed-endpoint");

    expect(response.status).toBe(402);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("uses the server key for a funded managed endpoint", async () => {
    const { configureCreditAccount } = await import("../../src/server/lib/creditStore");
    await configureCreditAccount({
      username: "anonymous",
      walletGroupId: "default",
      allowance: 10,
      refreshIntervalMs: 86_400_000,
      refreshingCredits: 10,
      staticCredits: 0,
      maxActiveJobs: 1,
      nextRefreshAt: "2099-01-01T00:00:00.000Z"
    });
    const { app, cookie } = await createInvitedApp();

    expect((await submit(app, cookie, "managed-endpoint")).status).toBe(200);
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer rp_server_key");
  });

  it("treats unknown endpoints as free and uses the submitted key", async () => {
    const { app, cookie } = await createInvitedApp();

    expect((await submit(app, cookie, "unknown-endpoint")).status).toBe(200);
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer rp_user_key");
  });

  it("settles a queued managed cancellation for free", async () => {
    const { configureCreditAccount } = await import("../../src/server/lib/creditStore");
    await configureCreditAccount({
      username: "anonymous",
      walletGroupId: "default",
      allowance: 10,
      refreshIntervalMs: 86_400_000,
      refreshingCredits: 10,
      staticCredits: 0,
      maxActiveJobs: 1,
      nextRefreshAt: "2099-01-01T00:00:00.000Z"
    });
    const jobStore = await import("../../src/server/lib/jobStore");
    await jobStore.createJob({
      jobId: "queued-job",
      displayName: "12345678",
      endpointId: "managed-endpoint",
      workflowFileName: null,
      submittedAt: "2026-08-08T00:00:00.000Z",
      startedAt: null,
      completedAt: null,
      expiresAt: null,
      status: "IN_QUEUE",
      isTerminal: false,
      imageCount: 0,
      lastError: null,
      createdBy: null,
      billingMode: "managed",
      walletGroupId: "default",
      billingUsername: "anonymous"
    }, { draftValues: {}, submittedInput: {} });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "CANCELLED" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })));
    const { app, cookie } = await createInvitedApp();

    const response = await app.request("http://localhost/api/runpod/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "http://localhost:5173" },
      body: JSON.stringify({ endpointId: "managed-endpoint", apiKey: "rp_user_key", id: "queued-job" })
    });

    expect(response.status).toBe(200);
    expect(await jobStore.readJob("queued-job")).toMatchObject({ creditsCharged: 0, executionTimeMs: 0 });
  });
});