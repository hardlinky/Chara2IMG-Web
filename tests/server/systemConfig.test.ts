import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("system config", () => {
  beforeEach(() => {
    process.env.INVITE_SECRET = "invite-test";
    process.env.COOKIE_SECRET = "cookie-secret-test";
    process.env.RUNPOD_ENDPOINT_ID = "managed-default";
    process.env.MANAGED_ENDPOINT_WALLETS = JSON.stringify({
      "managed-a": "shared",
      "managed-b": "shared"
    });
    process.env.SERVER_RUNPOD_API_KEY = "rp_server";
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.INVITE_SECRET;
    delete process.env.COOKIE_SECRET;
    delete process.env.RUNPOD_ENDPOINT_ID;
    delete process.env.MANAGED_ENDPOINT_WALLETS;
    delete process.env.SERVER_RUNPOD_API_KEY;
  });

  it("lists every managed endpoint without exposing the server key", async () => {
    const { createServerApp } = await import("../../src/server/index");
    const app = createServerApp();
    const invited = await app.request("http://localhost/api/access/verify-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite: "invite-test" })
    });
    const cookie = invited.headers.get("set-cookie")?.split(";")[0] ?? "";
    const response = await app.request("http://localhost/api/system/config", { headers: { Cookie: cookie } });
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      endpointId: "managed-default",
      hasRunpodApiKey: true,
      managedEndpointIds: ["managed-default", "managed-a", "managed-b"]
    });
    expect(JSON.stringify(body)).not.toContain("rp_server");
  });
});