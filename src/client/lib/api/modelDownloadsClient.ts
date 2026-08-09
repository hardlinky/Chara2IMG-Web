import type { DownloadEntry } from "../../../shared/contracts/modelDownloads";

export type DownloadsConfig = {
  civitaiKeyConfigured: boolean;
  huggingfaceKeyConfigured: boolean;
};

export async function fetchDownloadsConfig(): Promise<DownloadsConfig> {
  const res = await fetch("/api/admin/model-downloads/config", { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch downloads config: ${res.status}`);
  const data = (await res.json()) as { ok: boolean; civitaiKeyConfigured: boolean; huggingfaceKeyConfigured: boolean };
  return { civitaiKeyConfigured: data.civitaiKeyConfigured, huggingfaceKeyConfigured: data.huggingfaceKeyConfigured };
}

export async function fetchDownloadFolders(): Promise<string[]> {
  const res = await fetch("/api/admin/model-downloads/folders", { credentials: "include" });
  if (!res.ok) return [];
  const data = (await res.json()) as { ok: boolean; folders: string[] };
  return Array.isArray(data.folders) ? data.folders : [];
}

export async function fetchDownloads(): Promise<DownloadEntry[]> {
  const res = await fetch("/api/admin/model-downloads", { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch downloads: ${res.status}`);
  const data = (await res.json()) as { ok: boolean; downloads: DownloadEntry[] };
  return Array.isArray(data.downloads) ? data.downloads : [];
}

export async function enqueueDownload(
  url: string,
  destPath: string,
  civitaiApiKey?: string,
  huggingfaceApiKey?: string,
): Promise<{ ok: true; entry: DownloadEntry } | { ok: false; error: string }> {
  const res = await fetch("/api/admin/model-downloads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ url, destPath, civitaiApiKey, huggingfaceApiKey }),
  });
  const data = (await res.json()) as { ok: boolean; entry?: DownloadEntry; error?: string };
  if (!data.ok) return { ok: false, error: data.error ?? "Unknown error" };
  return { ok: true, entry: data.entry! };
}

export async function cancelDownload(id: string): Promise<void> {
  await fetch(`/api/admin/model-downloads/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    credentials: "include",
  });
}

export async function restartDownload(
  id: string,
  civitaiApiKey?: string,
  huggingfaceApiKey?: string,
): Promise<{ ok: true; entry: DownloadEntry } | { ok: false; error: string }> {
  const res = await fetch(`/api/admin/model-downloads/${encodeURIComponent(id)}/restart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ civitaiApiKey, huggingfaceApiKey }),
  });
  const data = (await res.json()) as { ok: boolean; entry?: DownloadEntry; error?: string };
  if (!data.ok) return { ok: false, error: data.error ?? "Unknown error" };
  return { ok: true, entry: data.entry! };
}

export async function refreshDownloadMetadata(
  id: string,
  civitaiApiKey?: string
): Promise<{ ok: true; entry: DownloadEntry } | { ok: false; error: string }> {
  const res = await fetch(`/api/admin/model-downloads/${encodeURIComponent(id)}/metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ civitaiApiKey })
  });
  const data = (await res.json()) as { ok: boolean; entry?: DownloadEntry; error?: string };
  if (!data.ok) return { ok: false, error: data.error ?? "Metadata refresh failed" };
  return { ok: true, entry: data.entry! };
}

export async function deleteDownload(id: string): Promise<void> {
  await fetch(`/api/admin/model-downloads/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
}
