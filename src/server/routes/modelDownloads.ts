import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Hono } from "hono";
import { requireInvitedSession, hasAdminSession } from "../middleware/session.js";
import { enqueueDownloadSchema } from "../schemas/modelDownloads.js";
import { listDownloads, removeDownload, getDownload } from "../lib/modelDownloadStore.js";
import {
  enqueueDownload,
  cancelDownload,
  restartDownload,
  getNetworkModelsRoot,
  getCivitaiApiKey,
  getHuggingfaceApiKey,
} from "../lib/modelDownloader.js";

async function listNetworkFolders(): Promise<string[]> {
  const root = getNetworkModelsRoot();

  async function scan(dir: string, prefix: string, depth: number): Promise<string[]> {
    if (depth > 2) return [];
    try {
      const dirEntries = await readdir(dir, { withFileTypes: true });
      const results: string[] = [];
      for (const entry of dirEntries) {
        if (entry.isDirectory()) {
          const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
          results.push(rel);
          results.push(...(await scan(join(dir, entry.name), rel, depth + 1)));
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  return scan(root, "", 0);
}

export function registerModelDownloadRoutes(app: Hono): void {
  app.use("/api/admin/model-downloads", requireInvitedSession);
  app.use("/api/admin/model-downloads/*", requireInvitedSession);

  app.get("/api/admin/model-downloads/config", async (c) => {
    if (!(await hasAdminSession(c))) return c.json({ ok: false, error: "Forbidden" }, 403);
    return c.json({
      ok: true,
      civitaiKeyConfigured: Boolean(getCivitaiApiKey()),
      huggingfaceKeyConfigured: Boolean(getHuggingfaceApiKey()),
    });
  });

  app.get("/api/admin/model-downloads/folders", async (c) => {
    if (!(await hasAdminSession(c))) return c.json({ ok: false, error: "Forbidden" }, 403);
    return c.json({ ok: true, folders: await listNetworkFolders() });
  });

  app.get("/api/admin/model-downloads", async (c) => {
    if (!(await hasAdminSession(c))) return c.json({ ok: false, error: "Forbidden" }, 403);
    return c.json({ ok: true, downloads: listDownloads() });
  });

  app.post("/api/admin/model-downloads", async (c) => {
    if (!(await hasAdminSession(c))) return c.json({ ok: false, error: "Forbidden" }, 403);

    const payload = await c.req.json().catch(() => null);
    const parsed = enqueueDownloadSchema.safeParse(payload);
    if (!parsed.success) return c.json({ ok: false, error: "Invalid request" }, 400);

    const result = await enqueueDownload(
      parsed.data.url,
      parsed.data.destPath,
      parsed.data.civitaiApiKey,
      parsed.data.huggingfaceApiKey,
    );
    if (!result.ok) return c.json({ ok: false, error: result.error }, 400);
    return c.json({ ok: true, entry: result.entry }, 201);
  });

  app.post("/api/admin/model-downloads/:id/cancel", async (c) => {
    if (!(await hasAdminSession(c))) return c.json({ ok: false, error: "Forbidden" }, 403);
    const result = await cancelDownload(c.req.param("id"));
    if (!result.ok) return c.json({ ok: false, error: result.error }, 400);
    return c.json({ ok: true });
  });

  app.post("/api/admin/model-downloads/:id/restart", async (c) => {
    if (!(await hasAdminSession(c))) return c.json({ ok: false, error: "Forbidden" }, 403);

    const payload = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await restartDownload(
      c.req.param("id"),
      typeof payload.civitaiApiKey === "string" ? payload.civitaiApiKey : undefined,
      typeof payload.huggingfaceApiKey === "string" ? payload.huggingfaceApiKey : undefined,
    );
    if (!result.ok) return c.json({ ok: false, error: result.error }, 400);
    return c.json({ ok: true, entry: result.entry });
  });

  app.delete("/api/admin/model-downloads/:id", async (c) => {
    if (!(await hasAdminSession(c))) return c.json({ ok: false, error: "Forbidden" }, 403);

    const entry = getDownload(c.req.param("id"));
    if (!entry) return c.json({ ok: false, error: "Not found" }, 404);
    if (entry.status === "queued" || entry.status === "in_progress") {
      return c.json({ ok: false, error: "Cancel the download before removing it" }, 400);
    }

    await removeDownload(c.req.param("id"));
    return c.json({ ok: true });
  });
}
