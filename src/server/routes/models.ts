import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { Hono } from "hono";
import { requireInvitedSession } from "../middleware/session.js";
import { civitaiImageVariant, getModelPreviewPath, getNetworkModelsRoot } from "../lib/modelDownloader.js";
import { getDownload, listDownloads } from "../lib/modelDownloadStore.js";
import type { DownloadEntry } from "../../shared/contracts/modelDownloads.js";

const MODEL_FILE = /\.(safetensors|ckpt|pt|pth|bin)$/i;

const PREVIEW_CONTENT_TYPES: Record<string, string> = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

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
  return buildLoraIndex(downloads, (download) => (download.previewFile ? `/api/models/previews/${download.id}` : undefined));
}

/** Full-size renditions stay on the CivitAI CDN; only thumbnails are stored locally. */
export function buildLoraPreviewFullUrls(downloads: DownloadEntry[] = listDownloads()): Record<string, string> {
  return buildLoraIndex(downloads, (download) => (
    download.previewUrl ? civitaiImageVariant(download.previewUrl, "original=true") : undefined
  ));
}

export function registerModelRoutes(app: Hono): void {
  app.use("/api/models/*", requireInvitedSession);

  app.get("/api/models/previews/:id", async (c) => {
    const entry = getDownload(c.req.param("id"));
    const previewPath = entry ? getModelPreviewPath(entry) : null;
    if (!previewPath) return c.json({ ok: false, error: "Not found" }, 404);

    try {
      const bytes = await readFile(previewPath);
      return c.body(bytes, 200, {
        "Content-Type": PREVIEW_CONTENT_TYPES[extname(previewPath).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=86400"
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return c.json({ ok: false, error: "Not found" }, 404);
      throw err;
    }
  });

  app.get("/api/models/loras", async (c) => {
    const dir = join(getNetworkModelsRoot(), "loras");
    const downloads = listDownloads();
    const catalog = {
      downloadUrls: buildLoraDownloadUrls(downloads),
      triggerWords: buildLoraTriggerWords(downloads),
      previewUrls: buildLoraPreviewUrls(downloads),
      previewFullUrls: buildLoraPreviewFullUrls(downloads)
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
