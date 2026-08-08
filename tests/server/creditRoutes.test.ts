import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function cookieFrom(response: Response): string {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

describe("credit routes", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "credit-routes-"));
    process.env.CREDITS_DIR = join(rootDir, "credits");
    process.env.USERS_DIR = join(rootDir, "users");
    process.env.INVITE_SECRET = "invite-test";
    process.env.ADMIN_ACCESS_KEY = "admin-credit-test";
    process.env.COOKIE_SECRET = "cookie-secret-test";
    process.env.RUNPOD_ENDPOINT_ID = "managed-endpoint";
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.CREDITS_DIR;
    delete process.env.USERS_DIR;
    delete process.env.INVITE_SECRET;
    delete process.env.ADMIN_ACCESS_KEY;
    delete process.env.COOKIE_SECRET;
    delete process.env.RUNPOD_ENDPOINT_ID;
    await rm(rootDir, { recursive: true, force: true });
  });

  async function invitedCookie(app: { request: (url: string, init: RequestInit) => Response | Promise<Response> }) {
    const response = await app.request("http://localhost/api/access/verify-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite: "invite-test" })
    });
    return cookieFrom(response);
  }

  it("lets an admin configure and list a user wallet", async () => {
    const { createServerApp } = await import("../../src/server/index");
    const app = createServerApp();
    const invited = await invitedCookie(app);
    const verified = await app.request("http://localhost/api/admin/verify-key", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: invited },
      body: JSON.stringify({ key: "admin-credit-test" })
    });
    const cookie = `${invited}; ${cookieFrom(verified)}`;

    const update = await app.request("http://localhost/api/admin/credits/accounts", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        username: "artist",
        walletGroupId: "default",
        allowance: 100,
        refreshIntervalMs: 3_600_000,
        refreshingCredits: 80,
        staticCredits: 25,
        maxActiveJobs: 2,
        nextRefreshAt: "2099-01-01T00:00:00.000Z"
      })
    });
    const listed = await app.request("http://localhost/api/admin/credits", { headers: { Cookie: cookie } });

    expect(update.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      users: expect.arrayContaining(["anonymous", "artist"]),
      accounts: [expect.objectContaining({ username: "artist", refreshingCredits: 80, staticCredits: 25 })],
      managedEndpoints: { "managed-endpoint": "default" }
    });
  });

  it("lets an admin assign the wallet shared by all anonymous sessions", async () => {
    const { createServerApp } = await import("../../src/server/index");
    const app = createServerApp();
    const firstInvited = await invitedCookie(app);
    const verified = await app.request("http://localhost/api/admin/verify-key", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: firstInvited },
      body: JSON.stringify({ key: "admin-credit-test" })
    });
    const adminCookie = `${firstInvited}; ${cookieFrom(verified)}`;
    const update = await app.request("http://localhost/api/admin/credits/accounts", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        username: "anonymous",
        walletGroupId: "default",
        allowance: 50,
        refreshIntervalMs: 86_400_000,
        refreshingCredits: 40,
        staticCredits: 5,
        maxActiveJobs: 3,
        nextRefreshAt: "2099-01-01T00:00:00.000Z"
      })
    });
    const secondInvited = await invitedCookie(app);

    const firstBalance = await app.request("http://localhost/api/users/credits?endpointId=managed-endpoint", {
      headers: { Cookie: firstInvited }
    });
    const secondBalance = await app.request("http://localhost/api/users/credits?endpointId=managed-endpoint", {
      headers: { Cookie: secondInvited }
    });

    expect(update.status).toBe(200);
    expect(await firstBalance.json()).toMatchObject({ refreshingCredits: 40, staticCredits: 5, maxActiveJobs: 3 });
    expect(await secondBalance.json()).toMatchObject({ refreshingCredits: 40, staticCredits: 5, maxActiveJobs: 3 });
  });

  it("returns the current session balance for a managed endpoint", async () => {
    const { configureCreditAccount } = await import("../../src/server/lib/creditStore");
    await configureCreditAccount({
      username: "anonymous",
      walletGroupId: "default",
      allowance: 10,
      refreshIntervalMs: 86_400_000,
      refreshingCredits: 7,
      staticCredits: 3,
      maxActiveJobs: 1,
      nextRefreshAt: "2099-01-01T00:00:00.000Z"
    });
    const { createServerApp } = await import("../../src/server/index");
    const app = createServerApp();
    const cookie = await invitedCookie(app);

    const response = await app.request("http://localhost/api/users/credits?endpointId=managed-endpoint", {
      headers: { Cookie: cookie }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ managed: true, refreshingCredits: 7, staticCredits: 3 });
  });
});