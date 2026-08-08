import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServerApp } from "../../src/server/index";

function cookieFrom(response: Response): string {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function authenticateAdmin(app: ReturnType<typeof createServerApp>): Promise<string> {
  const inviteResponse = await app.request("http://localhost/api/access/verify-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invite: "invite-test" })
  });
  const invitedCookie = cookieFrom(inviteResponse);
  const adminResponse = await app.request("http://localhost/api/admin/verify-key", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: invitedCookie },
    body: JSON.stringify({ key: "admin-test" })
  });
  return `${invitedCookie}; ${cookieFrom(adminResponse)}`;
}

describe("admin workflow uploads", () => {
  let workflowsDir: string;

  beforeEach(async () => {
    workflowsDir = await mkdtemp(join(tmpdir(), "admin-workflows-"));
    process.env.STOCK_WORKFLOWS_DIR = workflowsDir;
    process.env.INVITE_SECRET = "invite-test";
    process.env.ADMIN_ACCESS_KEY = "admin-test";
    process.env.COOKIE_SECRET = "cookie-secret-test";
  });

  afterEach(async () => {
    delete process.env.STOCK_WORKFLOWS_DIR;
    delete process.env.INVITE_SECRET;
    delete process.env.ADMIN_ACCESS_KEY;
    delete process.env.COOKIE_SECRET;
    await rm(workflowsDir, { recursive: true, force: true });
  });

  it("writes a valid workflow for an authenticated admin", async () => {
    const app = createServerApp();
    const cookie = await authenticateAdmin(app);
    const workflow = { "1": { class_type: "KSampler", inputs: { seed: 1 } } };

    const response = await app.request("http://localhost/api/admin/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ filename: "Stock Portrait.json", workflow })
    });

    expect(response.status).toBe(201);
    await expect(readFile(join(workflowsDir, "Stock Portrait.json"), "utf8"))
      .resolves.toBe(`${JSON.stringify(workflow, null, 2)}\n`);
  });

  it("rejects uploads without an admin session", async () => {
    const app = createServerApp();
    const response = await app.request("http://localhost/api/admin/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "workflow.json",
        workflow: { "1": { class_type: "KSampler", inputs: { seed: 1 } } }
      })
    });

    expect(response.status).toBe(401);
  });

  it("rejects unsafe filenames and invalid workflow content", async () => {
    const app = createServerApp();
    const cookie = await authenticateAdmin(app);
    const headers = { "Content-Type": "application/json", Cookie: cookie };

    const unsafe = await app.request("http://localhost/api/admin/workflows", {
      method: "POST",
      headers,
      body: JSON.stringify({
        filename: "../workflow.json",
        workflow: { "1": { class_type: "KSampler", inputs: { seed: 1 } } }
      })
    });
    const invalid = await app.request("http://localhost/api/admin/workflows", {
      method: "POST",
      headers,
      body: JSON.stringify({ filename: "workflow.json", workflow: { unexpected: true } })
    });

    expect(unsafe.status).toBe(400);
    expect(invalid.status).toBe(400);
  });

  it("requires explicit overwrite for an existing filename", async () => {
    const app = createServerApp();
    const cookie = await authenticateAdmin(app);
    const workflow = { "1": { class_type: "KSampler", inputs: { seed: 1 } } };
    const request = () => app.request("http://localhost/api/admin/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ filename: "workflow.json", workflow })
    });

    expect((await request()).status).toBe(201);
    expect((await request()).status).toBe(409);

    const replacement = { "2": { class_type: "SaveImage", inputs: { filename_prefix: "stock" } } };
    const overwriteResponse = await app.request("http://localhost/api/admin/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ filename: "workflow.json", workflow: replacement, overwrite: true })
    });
    expect(overwriteResponse.status).toBe(201);
    await expect(readFile(join(workflowsDir, "workflow.json"), "utf8"))
      .resolves.toBe(`${JSON.stringify(replacement, null, 2)}\n`);
  });
});