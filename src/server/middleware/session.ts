import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";

const SESSION_COOKIE_NAME = "invited_session";
const SESSION_COOKIE_VALUE = "invited";
const ADMIN_SESSION_COOKIE_NAME = "admin_session";
const ADMIN_SESSION_COOKIE_VALUE = "admin";

function getCookieSecret(): string {
  return process.env.COOKIE_SECRET ?? "";
}

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax" as const,
    path: "/",
    maxAge: 60 * 60 * 8
  };
}

export async function issueSessionCookie(c: Context): Promise<void> {
  await setSignedCookie(c, SESSION_COOKIE_NAME, SESSION_COOKIE_VALUE, getCookieSecret(), getCookieOptions());
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    ...getCookieOptions(),
    maxAge: 0
  });
}

export async function hasInvitedSession(c: Context): Promise<boolean> {
  const signedValue = await getSignedCookie(c, getCookieSecret(), SESSION_COOKIE_NAME);
  return signedValue === SESSION_COOKIE_VALUE;
}

export async function issueAdminSessionCookie(c: Context): Promise<void> {
  await setSignedCookie(c, ADMIN_SESSION_COOKIE_NAME, ADMIN_SESSION_COOKIE_VALUE, getCookieSecret(), getCookieOptions());
}

export function clearAdminSessionCookie(c: Context): void {
  deleteCookie(c, ADMIN_SESSION_COOKIE_NAME, {
    ...getCookieOptions(),
    maxAge: 0
  });
}

export async function hasAdminSession(c: Context): Promise<boolean> {
  const signedValue = await getSignedCookie(c, getCookieSecret(), ADMIN_SESSION_COOKIE_NAME);
  return signedValue === ADMIN_SESSION_COOKIE_VALUE;
}

export const requireInvitedSession: MiddlewareHandler = async (c, next) => {
  const invited = await hasInvitedSession(c);

  if (!invited) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  await next();
};

export const requireAdminSession: MiddlewareHandler = async (c, next) => {
  const invited = await hasInvitedSession(c);
  const admin = await hasAdminSession(c);

  if (!invited || !admin) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  await next();
};
