import type { Hono } from "hono";
import { clearAdminSessionCookie, hasInvitedSession, issueSessionCookie, clearSessionCookie } from "../middleware/session";
import { verifyInviteSecret } from "../security/invite";
import { verifyInviteSchema } from "../schemas/access";

function getInviteSecret(): string {
  return process.env.INVITE_SECRET ?? "";
}

export function registerAccessRoutes(app: Hono): void {
  app.post("/api/access/verify-invite", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = verifyInviteSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid request" }, 400);
    }

    const validInvite = verifyInviteSecret(parsed.data.invite, getInviteSecret());

    if (!validInvite) {
      return c.json({ ok: false, error: "Invalid invite" }, 401);
    }

    await issueSessionCookie(c);

    return c.json({ ok: true, invited: true });
  });

  app.get("/api/access/session", async (c) => {
    const invited = await hasInvitedSession(c);
    return c.json({ ok: true, invited });
  });

  app.post("/api/access/logout", (c) => {
    clearSessionCookie(c);
    clearAdminSessionCookie(c);
    return c.json({ ok: true, invited: false });
  });
}
