import type { Hono } from "hono";
import { clearAdminSessionCookie, hasAdminSession, issueAdminSessionCookie, requireInvitedSession } from "../middleware/session";
import { deleteJobImage, listManifestImages } from "../lib/jobStore";
import { verifyAdminKeyRequestSchema } from "../schemas/admin";
import { getAdminPasskey } from "../security/adminPasskey";

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
