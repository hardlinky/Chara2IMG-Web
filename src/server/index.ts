import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { fileURLToPath } from "node:url";
import { registerAccessRoutes } from "./routes/access";
import { registerRunpodProxyRoutes } from "./routes/runpodProxy";
import { registerSystemRoutes } from "./routes/system";
import { applySecurityMiddleware } from "./middleware/security";

const CLIENT_DIST_ROOT = "./dist/client";

export function createServerApp(): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  applySecurityMiddleware(app);
  registerAccessRoutes(app);
  registerRunpodProxyRoutes(app);
  registerSystemRoutes(app);

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

  serve({
    fetch: app.fetch,
    port
  });

  console.log(`Server listening on http://localhost:${port}`);
}
