import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { createHash } from "node:crypto";
import { getAdminPasskey } from "../security/adminPasskey";

const SESSION_COOKIE_NAME = "invited_session";
const SESSION_COOKIE_VALUE = "invited";
const ADMIN_SESSION_COOKIE_NAME = "admin_session";
const USER_SESSION_COOKIE_NAME = "user_session";

function getAdminSessionCookieValue(): string {
  const digest = createHash("sha256").update(getAdminPasskey()).digest("hex").slice(0, 24);
  return `admin:${digest}`;
}

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
  await setSignedCookie(c, ADMIN_SESSION_COOKIE_NAME, getAdminSessionCookieValue(), getCookieSecret(), getCookieOptions());
}

export function clearAdminSessionCookie(c: Context): void {
  deleteCookie(c, ADMIN_SESSION_COOKIE_NAME, {
    ...getCookieOptions(),
    maxAge: 0
  });
}

export async function hasAdminSession(c: Context): Promise<boolean> {
  const signedValue = await getSignedCookie(c, getCookieSecret(), ADMIN_SESSION_COOKIE_NAME);
  return signedValue === getAdminSessionCookieValue();
}

export async function issueUserSessionCookie(c: Context, username: string): Promise<void> {
  await setSignedCookie(c, USER_SESSION_COOKIE_NAME, username, getCookieSecret(), getCookieOptions());
}

export function clearUserSessionCookie(c: Context): void {
  deleteCookie(c, USER_SESSION_COOKIE_NAME, {
    ...getCookieOptions(),
    maxAge: 0
  });
}

// Current logged-in username, or null for anonymous access.
export async function getSessionUser(c: Context): Promise<string | null> {
  const signedValue = await getSignedCookie(c, getCookieSecret(), USER_SESSION_COOKIE_NAME);
  return typeof signedValue === "string" && signedValue.length > 0 ? signedValue : null;
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
