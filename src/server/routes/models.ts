import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Hono } from "hono";
import { requireInvitedSession } from "../middleware/session.js";
import { getNetworkModelsRoot } from "../lib/modelDownloader.js";

const MODEL_FILE = /\.(safetensors|ckpt|pt|pth|bin)$/i;

export function registerModelRoutes(app: Hono): void {
  app.use("/api/models/*", requireInvitedSession);

  app.get("/api/models/loras", async (c) => {
    const dir = join(getNetworkModelsRoot(), "loras");
    let files: string[];
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      files = entries.filter((e) => e.isFile() && MODEL_FILE.test(e.name)).map((e) => e.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return c.json({ ok: true, loras: [] });
      throw err;
    }
    return c.json({ ok: true, loras: files.sort() });
  });

  app.get("/api/models/checkpoints", async (c) => {
    const dir = join(getNetworkModelsRoot(), "checkpoints");
    let files: string[];
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      files = entries.filter((e) => e.isFile() && MODEL_FILE.test(e.name)).map((e) => e.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return c.json({ ok: true, checkpoints: [] });
      throw err;
    }
    return c.json({ ok: true, checkpoints: files.sort() });
  });
}
