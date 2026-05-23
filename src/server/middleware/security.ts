import type { Hono } from "hono";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN ?? "http://localhost:5173";
}

export function applySecurityMiddleware(app: Hono): void {
  const origin = getAllowedOrigin();

  app.use("/api/*", secureHeaders());

  app.use(
    "/api/*",
    cors({
      origin,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      credentials: true
    })
  );

  app.use("/api/*", csrf({ origin }));
}
