import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Hono } from "hono";
import { requireInvitedSession } from "../middleware/session.js";
import { getNetworkModelsRoot } from "../lib/modelDownloader.js";
import { listDownloads } from "../lib/modelDownloadStore.js";
import type { DownloadEntry } from "../../shared/contracts/modelDownloads.js";

const MODEL_FILE = /\.(safetensors|ckpt|pt|pth|bin)$/i;

export function buildLoraDownloadUrls(downloads: DownloadEntry[] = listDownloads()): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const download of downloads) {
    const pathParts = download.destPath.replaceAll("\\", "/").split("/").filter(Boolean);
    if (pathParts[0]?.toLowerCase() !== "loras") continue;

    const relativePath = [...pathParts.slice(1), download.filename].join("/");
    urls[relativePath] = download.url;
    if (!(download.filename in urls)) {
      urls[download.filename] = download.url;
    }
  }
  return urls;
}

export function buildLoraTriggerWords(downloads: DownloadEntry[] = listDownloads()): Record<string, string[]> {
  const triggerWords: Record<string, string[]> = {};
  for (const download of downloads) {
    const pathParts = download.destPath.replaceAll("\\", "/").split("/").filter(Boolean);
    if (pathParts[0]?.toLowerCase() !== "loras" || !download.triggerWords?.length) continue;

    const relativePath = [...pathParts.slice(1), download.filename].join("/");
    triggerWords[relativePath] = download.triggerWords;
    if (!(download.filename in triggerWords)) {
      triggerWords[download.filename] = download.triggerWords;
    }
  }
  return triggerWords;
}

export function registerModelRoutes(app: Hono): void {
  app.use("/api/models/*", requireInvitedSession);

  app.get("/api/models/loras", async (c) => {
    const dir = join(getNetworkModelsRoot(), "loras");
    let files: string[];
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      files = entries.filter((e) => e.isFile() && MODEL_FILE.test(e.name)).map((e) => e.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return c.json({ ok: true, loras: [], downloadUrls: buildLoraDownloadUrls(), triggerWords: buildLoraTriggerWords() });
      }
      throw err;
    }
    return c.json({ ok: true, loras: files.sort(), downloadUrls: buildLoraDownloadUrls(), triggerWords: buildLoraTriggerWords() });
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
