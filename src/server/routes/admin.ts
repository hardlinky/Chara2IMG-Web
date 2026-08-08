import type { Hono } from "hono";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  clearAdminSessionCookie,
  hasAdminSession,
  issueAdminSessionCookie,
  issueUserSessionCookie,
  requireInvitedSession
} from "../middleware/session";
import { deleteJobImage, listManifestImages } from "../lib/jobStore";
import { listUsernames, userExists } from "../lib/userStore";
import { impersonateRequestSchema, verifyAdminKeyRequestSchema } from "../schemas/admin";
import { getAdminPasskey } from "../security/adminPasskey";
import { validateWorkflowShape, validateWorkflowTemplateRules } from "../../shared/workflow/workflowSchemas";
import { getStockWorkflowsDir } from "./stockWorkflows";
import {
  configureCreditAccount,
  listCreditAccounts,
  listCreditLedger,
  listManagedEndpointWallets,
  type CreditAccount
} from "../lib/creditStore";
import { ANONYMOUS_CREDIT_USERNAME } from "../../shared/credits";

const MAX_WORKFLOW_BYTES = 5 * 1024 * 1024;

function isValidWorkflowFilename(filename: string): boolean {
  return filename.length <= 128
    && !filename.includes("..")
    && /^[^<>:"/\\|?*\u0000-\u001f]+\.json$/i.test(filename);
}

export function registerAdminRoutes(app: Hono): void {
  app.use("/api/admin/*", requireInvitedSession);

  app.get("/api/admin/session", async (c) => {
    const admin = await hasAdminSession(c);
    return c.json({ ok: true, admin });
  });

  app.post("/api/admin/verify-key", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = verifyAdminKeyRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid request" }, 400);
    }

    const valid = parsed.data.key === getAdminPasskey();
    if (!valid) {
      return c.json({ ok: false, error: "Invalid admin key" }, 401);
    }

    await issueAdminSessionCookie(c);
    return c.json({ ok: true, admin: true });
  });

  app.post("/api/admin/logout", (c) => {
    clearAdminSessionCookie(c);
    return c.json({ ok: true, admin: false });
  });

  app.get("/api/admin/credits", async (c) => {
    if (!(await hasAdminSession(c))) return c.json({ ok: false, error: "Forbidden" }, 403);
    const [users, accounts, ledger] = await Promise.all([
      listUsernames(),
      listCreditAccounts(),
      listCreditLedger()
    ]);
    const creditUsers = [...new Set([
      ANONYMOUS_CREDIT_USERNAME,
      ...users,
      ...accounts.map((account) => account.username)
    ])].sort((left, right) => left.localeCompare(right));
    return c.json({ ok: true, users: creditUsers, accounts, ledger, managedEndpoints: listManagedEndpointWallets() });
  });

  app.put("/api/admin/credits/accounts", async (c) => {
    if (!(await hasAdminSession(c))) return c.json({ ok: false, error: "Forbidden" }, 403);
    const payload = await c.req.json().catch(() => null) as Partial<CreditAccount> | null;
    const valid = payload
      && typeof payload.username === "string" && payload.username.trim().length > 0
      && typeof payload.walletGroupId === "string" && payload.walletGroupId.trim().length > 0
      && Number.isFinite(payload.allowance) && (payload.allowance ?? -1) >= 0
      && Number.isFinite(payload.refreshIntervalMs) && (payload.refreshIntervalMs ?? 0) > 0
      && Number.isFinite(payload.refreshingCredits)
      && Number.isFinite(payload.staticCredits)
      && Number.isFinite(payload.maxActiveJobs) && (payload.maxActiveJobs ?? 0) >= 1
      && typeof payload.nextRefreshAt === "string" && Number.isFinite(Date.parse(payload.nextRefreshAt));
    if (!valid) {
      return c.json({ ok: false, error: "Invalid credit account" }, 400);
    }
    const account: CreditAccount = {
      username: payload.username!.trim(),
      walletGroupId: payload.walletGroupId!.trim(),
      allowance: Math.floor(payload.allowance!),
      refreshIntervalMs: Math.floor(payload.refreshIntervalMs!),
      refreshingCredits: Math.floor(payload.refreshingCredits!),
      staticCredits: Math.floor(payload.staticCredits!),
      maxActiveJobs: Math.floor(payload.maxActiveJobs!),
      nextRefreshAt: new Date(payload.nextRefreshAt!).toISOString()
    };
    await configureCreditAccount(account);
    return c.json({ ok: true, account });
  });

  // Adopt an existing user's identity by issuing them a user session cookie.
  app.post("/api/admin/impersonate", async (c) => {
    const admin = await hasAdminSession(c);
    if (!admin) return c.json({ ok: false, error: "Forbidden" }, 403);

    const payload = await c.req.json().catch(() => null);
    const parsed = impersonateRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid request" }, 400);
    }

    if (!(await userExists(parsed.data.username))) {
      return c.json({ ok: false, error: "No such user" }, 404);
    }

    await issueUserSessionCookie(c, parsed.data.username);
    return c.json({ ok: true, username: parsed.data.username });
  });

  app.post("/api/admin/workflows", async (c) => {
    const admin = await hasAdminSession(c);
    if (!admin) return c.json({ ok: false, error: "Forbidden" }, 403);

    const contentLength = Number(c.req.header("Content-Length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_WORKFLOW_BYTES) {
      return c.json({ ok: false, error: "Workflow file is too large" }, 413);
    }

    const payload = await c.req.json().catch(() => null) as {
      filename?: unknown;
      workflow?: unknown;
      overwrite?: unknown;
    } | null;
    const filename = typeof payload?.filename === "string" ? payload.filename.trim() : "";
    if (!isValidWorkflowFilename(filename)) {
      return c.json({ ok: false, error: "Invalid workflow filename" }, 400);
    }

    const shapeIssues = validateWorkflowShape(payload?.workflow);
    const templateIssues = validateWorkflowTemplateRules(payload?.workflow);
    if (shapeIssues.length > 0 || templateIssues.length > 0) {
      return c.json({ ok: false, error: "Invalid ComfyUI workflow template" }, 400);
    }

    const content = `${JSON.stringify(payload?.workflow, null, 2)}\n`;
    if (Buffer.byteLength(content, "utf8") > MAX_WORKFLOW_BYTES) {
      return c.json({ ok: false, error: "Workflow file is too large" }, 413);
    }

    const dir = getStockWorkflowsDir();
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(join(dir, filename), content, {
        encoding: "utf8",
        flag: payload?.overwrite === true ? "w" : "wx"
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return c.json({ ok: false, error: "A workflow with that filename already exists" }, 409);
      }
      throw error;
    }

    return c.json({ ok: true, filename }, 201);
  });

  app.get("/api/admin/manifest", async (c) => {
    const admin = await hasAdminSession(c);
    if (!admin) return c.json({ ok: false, error: "Forbidden" }, 403);

    return c.json({ ok: true, jobs: await listManifestImages() });
  });

  app.delete("/api/admin/jobs/:jobId/images/:index", async (c) => {
    const admin = await hasAdminSession(c);
    if (!admin) return c.json({ ok: false, error: "Forbidden" }, 403);

    const index = Number.parseInt(c.req.param("index"), 10);
    if (!Number.isFinite(index) || index < 0) {
      return c.json({ ok: false, error: "Invalid index" }, 400);
    }

    const removed = await deleteJobImage(c.req.param("jobId"), index);
    return c.json({ ok: removed });
  });
}
