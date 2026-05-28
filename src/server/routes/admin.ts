import type { Hono } from "hono";
import { clearAdminSessionCookie, hasAdminSession, issueAdminSessionCookie, requireInvitedSession } from "../middleware/session";
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
}
