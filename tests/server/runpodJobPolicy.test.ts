import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

type ServerModule = typeof import("../../src/server/index");
type SettingsModule = typeof import("../../src/server/lib/runpodSettingsStore");

let server: ServerModule;
let settingsStore: SettingsModule;
let tmpBase: string;

async function invitedCookie(app: ReturnType<ServerModule["createServerApp"]>): Promise<string> {
  const response = await app.request("http://localhost/api/access/verify-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
    body: JSON.stringify({ invite: "invite-test" })
  });

  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

async function submitJob(app: ReturnType<ServerModule["createServerApp"]>, cookie: string): Promise<Response> {
  return app.request("http://localhost/api/runpod/run", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "http://localhost:5173" },
    body: JSON.stringify({ endpointId: "abc123", apiKey: "rp_test_key", input: { prompt: "hello" } })
  });
}

function forwardedRunBody(): Record<string, unknown> {
  const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

beforeEach(async () => {
  tmpBase = await mkdtemp(join(tmpdir(), "runpod-job-settings-"));
  process.env.NETWORK_MOUNT_DIR = tmpBase;
  process.env.INVITE_SECRET = "invite-test";
  process.env.COOKIE_SECRET = "cookie-secret-test";
  process.env.ALLOWED_ORIGIN = "http://localhost:5173";
  process.env.RUNPOD_POD_ID = "pod-abc";
  process.env.PORT = "3000";

  // No job id in the response keeps the background job tracker out of these
  // tests; only the outgoing request shape matters here.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }))
  );

  vi.resetModules();
  settingsStore = await import("../../src/server/lib/runpodSettingsStore");
  server = await import("../../src/server/index");
});

afterEach(async () => {
  delete process.env.NETWORK_MOUNT_DIR;
  delete process.env.RUNPOD_POD_ID;
  vi.unstubAllGlobals();
  await rm(tmpBase, { recursive: true, force: true });
});

describe("runpod job settings applied to submissions", () => {
  it("submits without a policy or webhook by default", async () => {
    const app = server.createServerApp();
    const response = await submitJob(app, await invitedCookie(app));

    expect(response.status).toBe(200);
    const body = forwardedRunBody();
    expect(body.policy).toBeUndefined();
    expect(body.webhook).toBeUndefined();
  });

  it("adds the configured execution timeout in milliseconds", async () => {
    await settingsStore.setRunpodJobSettings({ useWebhook: false, executionTimeoutSeconds: 120 });

    const app = server.createServerApp();
    await submitJob(app, await invitedCookie(app));

    expect(forwardedRunBody().policy).toEqual({ executionTimeout: 120_000 });
  });

  it("adds the callback URL when webhooks are enabled", async () => {
    await settingsStore.setRunpodJobSettings({ useWebhook: true, executionTimeoutSeconds: 0 });
    const secret = await settingsStore.getWebhookSecret();

    const app = server.createServerApp();
    await submitJob(app, await invitedCookie(app));

    expect(forwardedRunBody().webhook).toBe(`https://pod-abc-3000.proxy.runpod.net/api/webhooks/runpod/${secret}`);
  });

  it("omits the callback URL when the server has no public address", async () => {
    delete process.env.RUNPOD_POD_ID;
    await settingsStore.setRunpodJobSettings({ useWebhook: true, executionTimeoutSeconds: 0 });

    const app = server.createServerApp();
    await submitJob(app, await invitedCookie(app));

    expect(forwardedRunBody().webhook).toBeUndefined();
  });
});

describe("runpod webhook receiver", () => {
  it("accepts callbacks carrying the configured secret without a session", async () => {
    const secret = await settingsStore.getWebhookSecret();
    const app = server.createServerApp();

    const response = await app.request(`http://localhost/api/webhooks/runpod/${secret}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "unknown-job", status: "COMPLETED" })
    });

    expect(response.status).toBe(200);
  });

  it("rejects callbacks with a wrong secret", async () => {
    await settingsStore.getWebhookSecret();
    const app = server.createServerApp();

    const response = await app.request("http://localhost/api/webhooks/runpod/not-the-secret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "job-1", status: "COMPLETED" })
    });

    expect(response.status).toBe(404);
  });
});
