import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { registerAccessRoutes } from "./routes/access";
import { applySecurityMiddleware } from "./middleware/security";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

applySecurityMiddleware(app);
registerAccessRoutes(app);

const port = Number(process.env.PORT ?? 3000);

serve({
  fetch: app.fetch,
  port
});

console.log(`Server listening on http://localhost:${port}`);
