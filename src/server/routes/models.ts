import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Hono } from "hono";
import { requireInvitedSession } from "../middleware/session.js";
import { getNetworkModelsRoot } from "../lib/modelDownloader.js";
import { listDownloads } from "../lib/modelDownloadStore.js";
import type { DownloadEntry } from "../../shared/contracts/modelDownloads.js";

const MODEL_FILE = /\.(safetensors|ckpt|pt|pth|bin)$/i;

/** Index a lora download detail by both its relative path and its bare filename. */
function buildLoraIndex<T>(downloads: DownloadEntry[], select: (download: DownloadEntry) => T | undefined): Record<string, T> {
  const index: Record<string, T> = {};
  for (const download of downloads) {
    const pathParts = download.destPath.replaceAll("\\", "/").split("/").filter(Boolean);
    if (pathParts[0]?.toLowerCase() !== "loras") continue;

    const value = select(download);
    if (value === undefined) continue;

    const relativePath = [...pathParts.slice(1), download.filename].join("/");
    index[relativePath] = value;
    if (!(download.filename in index)) {
      index[download.filename] = value;
    }
  }
  return index;
}

export function buildLoraDownloadUrls(downloads: DownloadEntry[] = listDownloads()): Record<string, string> {
  return buildLoraIndex(downloads, (download) => download.url);
}

export function buildLoraTriggerWords(downloads: DownloadEntry[] = listDownloads()): Record<string, string[]> {
  return buildLoraIndex(downloads, (download) => (download.triggerWords?.length ? download.triggerWords : undefined));
}

export function buildLoraPreviewUrls(downloads: DownloadEntry[] = listDownloads()): Record<string, string> {
  return buildLoraIndex(downloads, (download) => download.previewUrl || undefined);
}

export function registerModelRoutes(app: Hono): void {
  app.use("/api/models/*", requireInvitedSession);

  app.get("/api/models/loras", async (c) => {
    const dir = join(getNetworkModelsRoot(), "loras");
    const downloads = listDownloads();
    const catalog = {
      downloadUrls: buildLoraDownloadUrls(downloads),
      triggerWords: buildLoraTriggerWords(downloads),
      previewUrls: buildLoraPreviewUrls(downloads)
    };

    let files: string[];
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      files = entries.filter((e) => e.isFile() && MODEL_FILE.test(e.name)).map((e) => e.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return c.json({ ok: true, loras: [], ...catalog });
      }
      throw err;
    }
    return c.json({ ok: true, loras: files.sort(), ...catalog });
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
