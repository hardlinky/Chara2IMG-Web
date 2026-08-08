import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Hono } from "hono";
import { requireInvitedSession } from "../middleware/session.js";

export function getStockWorkflowsDir(): string {
  return process.env.STOCK_WORKFLOWS_DIR?.trim() || "/workspace/workflows";
}

export function registerWorkflowsRoutes(app: Hono): void {
  app.use("/api/workflows*", requireInvitedSession);

  app.get("/api/workflows", async (c) => {
    const dir = getStockWorkflowsDir();
    let files: string[];
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      files = entries.filter((e) => e.isFile() && /\.json$/i.test(e.name)).map((e) => e.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return c.json({ ok: true, workflows: [] });
      throw err;
    }
    return c.json({ ok: true, workflows: files.sort() });
  });

  app.get("/api/workflows/:filename", async (c) => {
    const filename = c.req.param("filename");
    // Reject path traversal attempts
    if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
      return c.json({ ok: false, error: "Invalid filename" }, 400);
    }
    if (!/\.json$/i.test(filename)) {
      return c.json({ ok: false, error: "Only JSON files are served" }, 400);
    }
    const filePath = join(getStockWorkflowsDir(), filename);
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return c.json({ ok: false, error: "Not found" }, 404);
      throw err;
    }
    return c.text(content, 200, { "Content-Type": "application/json" });
  });
}
