import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  addDownload,
  getDownload,
  getNextQueued,
  removeDownload,
  updateEntry,
  updateProgress,
} from "./modelDownloadStore.js";
import { logServerError } from "./logger.js";
import type { DownloadEntry, DownloadSource } from "../../shared/contracts/modelDownloads.js";
import { resolveNetworkPath } from "./networkPaths.js";

// ─── Config ───────────────────────────────────────────────────────────────────

export function getNetworkModelsRoot(): string {
  return resolveNetworkPath("NETWORK_MODELS_ROOT", "runpod-slim/ComfyUI/models");
}

export function getCivitaiApiKey(): string | undefined {
  return process.env.CIVITAI_API_KEY?.trim() || undefined;
}

export function getHuggingfaceApiKey(): string | undefined {
  return process.env.HUGGINGFACE_API_KEY?.trim() || process.env.HF_TOKEN?.trim() || undefined;
}

// ─── Session-only API key cache (never written to disk) ───────────────────────

const apiKeyCache = new Map<string, string>();

// ─── URL helpers ─────────────────────────────────────────────────────────────

export function detectSource(url: string): DownloadSource | null {
  if (url.includes("civitai.com") || url.includes("civitai.red")) return "civitai";
  if (url.includes("huggingface.co")) return "huggingface";
  return null;
}

function buildDownloadUrl(url: string, source: DownloadSource, apiKey: string, resolvedVersionId?: number): string {
  if (source === "civitai") {
    let normalized = url;
    // Convert model page URL (civitai.com or civitai.red) to API download URL
    const pageMatch = /^https:\/\/civitai\.(?:com|red)\/models\/(\d+)/.exec(url);
    if (pageMatch && !url.includes("/api/download/")) {
      const versionMatch = /[?&]modelVersionId=(\d+)/.exec(url);
      // Download API uses the modelVersionId as the path param, not the model ID
      const downloadId = resolvedVersionId ?? (versionMatch ? versionMatch[1] : pageMatch[1]);
      normalized = `https://civitai.com/api/download/models/${downloadId}`;
    }
    const parsed = new URL(normalized);
    parsed.searchParams.set("token", apiKey);
    return parsed.toString();
  }
  // HuggingFace: convert /blob/ links to /resolve/ (direct download)
  return url.replace(/\/blob\//, "/resolve/");
}

function buildFetchHeaders(source: DownloadSource, apiKey: string): Record<string, string> {
  if (source === "huggingface") {
    return { Authorization: `Bearer ${apiKey}` };
  }
  return {};
}

function normalizeTriggerWords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((word): word is string => typeof word === "string").map((word) => word.trim()).filter(Boolean))];
}

export type CivitaiMetadata = {
  triggerWords: string[];
  modelId?: number;
  selectedVersionId?: number;
  latestVersionId?: number;
};

async function fetchCivitaiJson<T>(url: string, apiKey: string, signal?: AbortSignal): Promise<T | null> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal });
  return response.ok ? await response.json() as T : null;
}

export async function fetchCivitaiMetadata(
  sourceUrl: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<CivitaiMetadata> {
  const parsed = new URL(sourceUrl);
  const explicitVersionIdText = parsed.searchParams.get("modelVersionId")
    ?? /\/api\/(?:download\/models|v1\/model-versions)\/(\d+)/.exec(parsed.pathname)?.[1];
  const explicitVersionId = explicitVersionIdText ? Number(explicitVersionIdText) : undefined;
  const pageModelIdText = /^\/models\/(\d+)/.exec(parsed.pathname)?.[1];
  let modelId = pageModelIdText ? Number(pageModelIdText) : undefined;
  let selectedVersionId = explicitVersionId;
  let triggerWords: string[] = [];

  if (explicitVersionId) {
    const version = await fetchCivitaiJson<{ id?: number; modelId?: number; trainedWords?: unknown }>(
      `https://civitai.com/api/v1/model-versions/${explicitVersionId}`,
      apiKey,
      signal
    );
    modelId = version?.modelId ?? modelId;
    triggerWords = normalizeTriggerWords(version?.trainedWords);
  }

  if (!modelId) return { triggerWords, selectedVersionId };
  const model = await fetchCivitaiJson<{ modelVersions?: Array<{ id?: number; trainedWords?: unknown }> }>(
    `https://civitai.com/api/v1/models/${modelId}`,
    apiKey,
    signal
  );
  const latestVersion = model?.modelVersions?.[0];
  if (!selectedVersionId) {
    selectedVersionId = latestVersion?.id;
    triggerWords = normalizeTriggerWords(latestVersion?.trainedWords);
  }
  return { triggerWords, modelId, selectedVersionId, latestVersionId: latestVersion?.id };
}

function guessFilenameFromUrl(url: string): string {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    return seg.includes(".") ? decodeURIComponent(seg) : "download.bin";
  } catch {
    return "download.bin";
  }
}

function extractFilenameFromResponse(response: Response, fallbackUrl: string): string {
  const cd = response.headers.get("content-disposition");
  if (cd) {
    const utf8 = /filename\*=UTF-8''([^;\r\n]+)/i.exec(cd);
    if (utf8) return decodeURIComponent(utf8[1].trim());
    const plain = /filename=["']?([^"';\r\n]+)["']?/i.exec(cd);
    if (plain) return plain[1].trim().replace(/^["']|["']$/g, "");
  }
  return guessFilenameFromUrl(fallbackUrl);
}
export async function ensureModelDownloadPaths(): Promise<void> {
  await mkdir(getNetworkModelsRoot(), { recursive: true });
}

export function getModelFilePath(entry: Pick<DownloadEntry, "destPath" | "filename">): string {
  return join(getNetworkModelsRoot(), entry.destPath, entry.filename);
}

export function getModelMetadataPath(entry: Pick<DownloadEntry, "destPath" | "filename">): string {
  return `${getModelFilePath(entry)}.json`;
}

export async function writeDownloadMetadata(entry: DownloadEntry, modelPath?: string): Promise<void> {
  const filePath = modelPath ?? getModelFilePath(entry);
  const metadataPath = `${filePath}.json`;
  const payload = {
    id: entry.id,
    source: entry.source,
    url: entry.url,
    destPath: entry.destPath,
    filename: entry.filename,
    triggerWords: entry.triggerWords ?? [],
    civitaiModelId: entry.civitaiModelId,
    civitaiModelVersionId: entry.civitaiModelVersionId,
    civitaiLatestModelVersionId: entry.civitaiLatestModelVersionId,
    metadataUpdatedAt: entry.metadataUpdatedAt ?? null,
    status: entry.status,
    bytesDownloaded: entry.bytesDownloaded,
    totalBytes: entry.totalBytes,
    createdAt: entry.createdAt,
    completedAt: entry.completedAt,
    error: entry.error,
  };
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(metadataPath, JSON.stringify(payload, null, 2), "utf8");
}

export async function readDownloadMetadata(entry: Pick<DownloadEntry, "destPath" | "filename">): Promise<Partial<DownloadEntry> | null> {
  const metadataPath = getModelMetadataPath(entry);
  try {
    const raw = await readFile(metadataPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<DownloadEntry>;
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function removeDownloadFiles(entry: Pick<DownloadEntry, "destPath" | "filename">): Promise<void> {
  const filePath = getModelFilePath(entry);
  const metadataPath = getModelMetadataPath(entry);

  await Promise.all([
    unlink(filePath).catch((err) => {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }),
    unlink(metadataPath).catch((err) => {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }),
  ]);
}
// ─── Queue processor ─────────────────────────────────────────────────────────

let isProcessing = false;
let currentAbortController: AbortController | null = null;
let currentDownloadId: string | null = null;

async function processQueue(): Promise<void> {
  if (isProcessing) return;

  const next = getNextQueued();
  if (!next) return;

  isProcessing = true;
  currentDownloadId = next.id;
  currentAbortController = new AbortController();

  try {
    await runDownload(next, currentAbortController.signal);
  } catch (err) {
    const aborted = currentAbortController?.signal.aborted ?? false;
    await updateEntry(next.id, {
      status: aborted ? "cancelled" : "failed",
      error: aborted ? null : String(err),
      completedAt: new Date().toISOString(),
    }).catch(() => {});
    if (!aborted) {
      logServerError("Model download failed", err, { id: next.id, url: next.url });
    }
  } finally {
    apiKeyCache.delete(next.id);
    isProcessing = false;
    currentDownloadId = null;
    currentAbortController = null;
    void processQueue();
  }
}

async function runDownload(entry: DownloadEntry, signal: AbortSignal): Promise<void> {
  const apiKey = apiKeyCache.get(entry.id);
  if (!apiKey) throw new Error("No API key available for this download");

  await updateEntry(entry.id, { status: "in_progress" });

  const civitaiMetadata = entry.source === "civitai"
    ? await fetchCivitaiMetadata(entry.url, apiKey, signal).catch(() => null)
    : null;
  if (civitaiMetadata) {
    await updateEntry(entry.id, {
      triggerWords: civitaiMetadata.triggerWords,
      civitaiModelId: civitaiMetadata.modelId,
      civitaiModelVersionId: civitaiMetadata.selectedVersionId,
      civitaiLatestModelVersionId: civitaiMetadata.latestVersionId,
      metadataUpdatedAt: new Date().toISOString()
    });
  }

  const downloadUrl = buildDownloadUrl(entry.url, entry.source, apiKey, civitaiMetadata?.selectedVersionId);
  const headers = buildFetchHeaders(entry.source, apiKey);

  const response = await fetch(downloadUrl, { headers, signal, redirect: "follow" });
  if (!response.ok) throw new Error(`Server returned ${response.status} ${response.statusText}`);
  if (!response.body) throw new Error("Response has no body");

  const filename = extractFilenameFromResponse(response, entry.url);
  const contentLength = response.headers.get("content-length");
  const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

  await updateEntry(entry.id, { filename, totalBytes });

  const destDir = join(getNetworkModelsRoot(), entry.destPath);
  await mkdir(destDir, { recursive: true });
  const modelPath = join(destDir, filename);

  const partPath = join(destDir, `${filename}.part`);
  const fileHandle = await open(partPath, "w");
  let bytesDownloaded = 0;

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await fileHandle.write(value);
      bytesDownloaded += value.length;
      updateProgress(entry.id, bytesDownloaded, totalBytes || bytesDownloaded);
    }
    await fileHandle.close();
    await rename(partPath, modelPath);
    const completedAt = new Date().toISOString();
    const completedEntry: DownloadEntry = {
      ...entry,
      filename,
      status: "finished",
      bytesDownloaded,
      totalBytes: totalBytes || bytesDownloaded,
      completedAt,
    };
    await updateEntry(entry.id, completedEntry);
    await writeDownloadMetadata(completedEntry, modelPath);
  } catch (err) {
    await fileHandle.close().catch(() => {});
    await unlink(partPath).catch(() => {});
    throw err;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type EnqueueResult =
  | { ok: true; entry: DownloadEntry }
  | { ok: false; error: string };

export async function enqueueDownload(
  url: string,
  destPath: string,
  civitaiApiKey?: string,
  huggingfaceApiKey?: string,
): Promise<EnqueueResult> {
  const source = detectSource(url);
  if (!source) return { ok: false, error: "URL must be from civitai.com, civitai.red, or huggingface.co" };

  const apiKey =
    source === "civitai"
      ? (civitaiApiKey?.trim() || getCivitaiApiKey())
      : (huggingfaceApiKey?.trim() || getHuggingfaceApiKey());

  if (!apiKey) return { ok: false, error: `No API key provided for ${source}` };

  const entry = await addDownload(url, destPath, source, guessFilenameFromUrl(url));
  apiKeyCache.set(entry.id, apiKey);
  void processQueue();
  return { ok: true, entry };
}

export async function cancelDownload(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const entry = getDownload(id);
  if (!entry) return { ok: false, error: "Not found" };
  if (entry.status !== "queued" && entry.status !== "in_progress") {
    return { ok: false, error: "Only queued or in-progress downloads can be cancelled" };
  }

  if (entry.status === "in_progress" && currentDownloadId === id) {
    currentAbortController?.abort();
    // processQueue() finalizes the status in the catch block
    return { ok: true };
  }

  await updateEntry(id, { status: "cancelled", completedAt: new Date().toISOString() });
  return { ok: true };
}

export async function restartDownload(
  id: string,
  civitaiApiKey?: string,
  huggingfaceApiKey?: string,
): Promise<EnqueueResult> {
  const entry = getDownload(id);
  if (!entry) return { ok: false, error: "Not found" };
  if (entry.status !== "cancelled" && entry.status !== "failed") {
    return { ok: false, error: "Only cancelled or failed downloads can be restarted" };
  }

  const apiKey =
    entry.source === "civitai"
      ? (civitaiApiKey?.trim() || getCivitaiApiKey())
      : (huggingfaceApiKey?.trim() || getHuggingfaceApiKey());

  if (!apiKey) return { ok: false, error: `No API key available for ${entry.source}` };

  await updateEntry(id, {
    status: "queued",
    bytesDownloaded: 0,
    totalBytes: 0,
    completedAt: null,
    error: null,
  });
  apiKeyCache.set(id, apiKey);
  void processQueue();
  return { ok: true, entry: getDownload(id)! };
}

export async function refreshDownloadMetadata(
  id: string,
  civitaiApiKey?: string
): Promise<{ ok: true; entry: DownloadEntry } | { ok: false; error: string }> {
  const entry = getDownload(id);
  if (!entry) return { ok: false, error: "Not found" };
  if (entry.source !== "civitai") return { ok: false, error: "Metadata refresh is only available for CivitAI downloads" };

  const apiKey = civitaiApiKey?.trim() || getCivitaiApiKey();
  if (!apiKey) return { ok: false, error: "No API key available for civitai" };

  const metadata = await fetchCivitaiMetadata(entry.url, apiKey);
  const sourceHasExplicitVersion = Boolean(
    new URL(entry.url).searchParams.get("modelVersionId")
    || /\/api\/(?:download\/models|v1\/model-versions)\/\d+/.test(new URL(entry.url).pathname)
  );
  await updateEntry(id, {
    triggerWords: metadata.triggerWords,
    civitaiModelId: metadata.modelId,
    civitaiModelVersionId: entry.civitaiModelVersionId ?? (sourceHasExplicitVersion ? metadata.selectedVersionId : undefined),
    civitaiLatestModelVersionId: metadata.latestVersionId,
    metadataUpdatedAt: new Date().toISOString()
  });
  return { ok: true, entry: getDownload(id)! };
}

export async function startQueueOnBoot(): Promise<void> {
  void processQueue();
}
