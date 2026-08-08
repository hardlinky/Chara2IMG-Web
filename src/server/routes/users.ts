import type { Hono } from "hono";
import {
  clearUserSessionCookie,
  getSessionUser,
  issueUserSessionCookie,
  requireInvitedSession
} from "../middleware/session";
import { loginOrCreateUser } from "../lib/userStore";
import { userLoginSchema } from "../schemas/users";
import { getCreditBalance } from "../lib/creditStore";
import { ANONYMOUS_CREDIT_USERNAME } from "../../shared/credits";

export function registerUserRoutes(app: Hono): void {
  app.use("/api/users/*", requireInvitedSession);

  // Log in to an existing user (password must match) or create a new one.
  app.post("/api/users/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = userLoginSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid request" }, 400);
    }

    const result = await loginOrCreateUser(parsed.data.username, parsed.data.password);
    if (!result.ok) {
      return c.json({ ok: false, error: "Incorrect password for existing user" }, 401);
    }

    await issueUserSessionCookie(c, parsed.data.username);
    return c.json({ ok: true, username: parsed.data.username, created: result.created });
  });

  app.post("/api/users/logout", (c) => {
    clearUserSessionCookie(c);
    return c.json({ ok: true, username: null });
  });

  app.get("/api/users/session", async (c) => {
    const username = await getSessionUser(c);
    return c.json({ ok: true, username });
  });

  app.get("/api/users/credits", async (c) => {
    const endpointId = c.req.query("endpointId")?.trim();
    if (!endpointId) {
      return c.json({ ok: false, error: "Endpoint ID is required" }, 400);
    }
    const username = (await getSessionUser(c)) ?? ANONYMOUS_CREDIT_USERNAME;
    return c.json({ ok: true, ...(await getCreditBalance(username, endpointId)) });
  });
}
