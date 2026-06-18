import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { fileURLToPath } from "node:url";
import { registerAccessRoutes } from "./routes/access";
import { registerAdminRoutes } from "./routes/admin";
import { registerRecentJobsRoutes } from "./routes/recentJobs";
import { registerPinnedImageRoutes } from "./routes/pinnedImages";
import { registerRunpodProxyRoutes } from "./routes/runpodProxy";
import { registerSystemRoutes } from "./routes/system";
import { applySecurityMiddleware } from "./middleware/security";
import { logAdminPasskey } from "./security/adminPasskey";
import { logServerError } from "./lib/logger";

const CLIENT_DIST_ROOT = "./dist/client";

export function createServerApp(): Hono {
  const app = new Hono();

  app.onError((error, c) => {
    logServerError("Unhandled route error", error, {
      method: c.req.method,
      path: c.req.path
    });

    return c.json({ ok: false, error: "Internal server error" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));

  applySecurityMiddleware(app);
  registerAccessRoutes(app);
  registerAdminRoutes(app);
  registerRecentJobsRoutes(app);
  registerPinnedImageRoutes(app);
  registerRunpodProxyRoutes(app);
  registerSystemRoutes(app);

  app.use("/*", async (c, next) => {
    await next();

    const contentType = c.res.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      c.res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
      c.res.headers.set("Pragma", "no-cache");
      c.res.headers.set("Expires", "0");
    }
  });

  app.use(
    "/*",
    serveStatic({
      root: CLIENT_DIST_ROOT,
      rewriteRequestPath: (path) => (path === "/" ? "/index.html" : path)
    })
  );

  app.get("*", serveStatic({ root: CLIENT_DIST_ROOT, path: "./index.html" }));

  return app;
}

const port = Number(process.env.PORT ?? 3000);

const isMainModule = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;

if (isMainModule) {
  const app = createServerApp();
  logAdminPasskey();

  process.on("unhandledRejection", (reason) => {
    logServerError("Unhandled promise rejection", reason);
  });

  process.on("uncaughtException", (error) => {
    logServerError("Uncaught exception", error);
  });

  serve({
    fetch: app.fetch,
    port
  });

  console.log(`Server listening on http://localhost:${port}`);
}
