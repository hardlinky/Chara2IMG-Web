import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import { registerAccessRoutes } from "./routes/access";
import { registerRunpodProxyRoutes } from "./routes/runpodProxy";
import { applySecurityMiddleware } from "./middleware/security";

export function createServerApp(): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  applySecurityMiddleware(app);
  registerAccessRoutes(app);
  registerRunpodProxyRoutes(app);

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
