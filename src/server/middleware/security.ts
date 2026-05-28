import type { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";

function getConfiguredAllowedOrigin(): string | undefined {
  return process.env.ALLOWED_ORIGIN?.trim() || undefined;
}

function resolveAllowedOrigin(origin: string, context: Context): string | null {
  const configuredOrigin = getConfiguredAllowedOrigin();

  if (configuredOrigin) {
    return origin === configuredOrigin ? configuredOrigin : null;
  }

  const requestOrigin = new URL(context.req.url).origin;
  return origin === requestOrigin ? requestOrigin : null;
}

export function applySecurityMiddleware(app: Hono): void {
  const configuredOrigin = getConfiguredAllowedOrigin();

  app.use("/api/*", secureHeaders());

  app.use(
    "/api/*",
    cors({
      origin: (origin, context) => resolveAllowedOrigin(origin, context) ?? undefined,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "x-chara2img-client-id"],
      credentials: true
    })
  );

  if (configuredOrigin) {
    app.use("/api/*", csrf({ origin: configuredOrigin }));
    return;
  }

  app.use("/api/*", csrf());
}
