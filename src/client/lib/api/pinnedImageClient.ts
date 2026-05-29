import { ProxyRequestError } from "./runpodProxyClient";

const PINNED_IMAGE_CLIENT_ID_STORAGE_KEY = "chara2imgPinnedImageClientId";

type BackupPinnedImagePayload = {
  clientId?: string;
  jobId: string;
  outputIndex: number;
  dataUrl: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
};

type BackupPinnedImageResponse = {
  ok: true;
  imageUrl: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
};

type ReleasePinnedImagePayload = {
  clientId?: string;
  jobId: string;
  outputIndex: number;
  imageUrl: string;
};

type ReleasePinnedImageResponse = {
  ok: true;
  deleted: boolean;
};

type ReconcilePinnedImagesPayload = {
  clientId?: string;
  refs: Array<{
    jobId: string;
    outputIndex: number;
    imageUrl: string;
  }>;
};

type ReconcilePinnedImagesResponse = {
  ok: true;
  reconciledEntries: number;
  deletedFiles: number;
};

export type PinnedImageClientUsage = {
  clientId: string;
  entries: number;
  bytes: number;
};

type PinnedImageClientsResponse = {
  ok: true;
  clients: PinnedImageClientUsage[];
};

type PrunePinnedImagesPayload = {
  keepClientIds: string[];
};

type PrunePinnedImagesPreviewResponse = {
  ok: true;
  keptEntries: number;
  keptBytes: number;
  keptClients: string[];
  removedEntries: number;
  removedBytes: number;
  removedClients: string[];
  orphanedFiles: number;
  orphanedBytes: number;
};

type PrunePinnedImagesResponse = {
  ok: true;
  removedEntries: number;
  removedClients: string[];
  deletedFiles: number;
  keptEntries: number;
  orphanedFilesDeleted: number;
};

type PinnedImageStorageStatsResponse = {
  ok: true;
  userUsedBytes: number;
  allUsersUsedBytes: number;
  totalCapacityBytes: number;
};

export function getOrCreatePinnedImageClientId(): string {
  if (typeof window === "undefined") {
    return "server-render";
  }

  const existing = window.localStorage.getItem(PINNED_IMAGE_CLIENT_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const generated = `client-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  window.localStorage.setItem(PINNED_IMAGE_CLIENT_ID_STORAGE_KEY, generated);
  return generated;
}

export async function backupPinnedImageViaProxy(payload: BackupPinnedImagePayload): Promise<BackupPinnedImageResponse> {
  const clientId = getOrCreatePinnedImageClientId();
  const response = await fetch("/api/pinned-images/backup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      ...payload,
      clientId
    })
  });

  const data = (await response.json().catch(() => null)) as BackupPinnedImageResponse | { error?: string } | null;
  if (!response.ok || !data || !("ok" in data)) {
    throw new ProxyRequestError(response.status, `Pinned image backup failed (${response.status})`, data);
  }

  return data;
}

export async function fetchPinnedImageStorageStatsViaProxy(): Promise<PinnedImageStorageStatsResponse> {
  const clientId = encodeURIComponent(getOrCreatePinnedImageClientId());
  const response = await fetch(`/api/pinned-images/stats?clientId=${clientId}`, {
    method: "GET",
    credentials: "include"
  });

  const data = (await response.json().catch(() => null)) as PinnedImageStorageStatsResponse | { error?: string } | null;
  if (!response.ok || !data || !("ok" in data) || data.ok !== true) {
    throw new ProxyRequestError(response.status, `Pinned image storage stats request failed (${response.status})`, data);
  }

  return data;
}

export async function releasePinnedImageViaProxy(payload: ReleasePinnedImagePayload): Promise<ReleasePinnedImageResponse> {
  const clientId = getOrCreatePinnedImageClientId();
  const response = await fetch("/api/pinned-images/release", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      ...payload,
      clientId
    })
  });

  const data = (await response.json().catch(() => null)) as ReleasePinnedImageResponse | { error?: string } | null;
  if (!response.ok || !data || !("ok" in data)) {
    throw new ProxyRequestError(response.status, `Pinned image release failed (${response.status})`, data);
  }

  return data;
}

export async function reconcilePinnedImagesViaProxy(payload: ReconcilePinnedImagesPayload): Promise<ReconcilePinnedImagesResponse> {
  const clientId = getOrCreatePinnedImageClientId();
  const response = await fetch("/api/pinned-images/reconcile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      ...payload,
      clientId
    })
  });

  const data = (await response.json().catch(() => null)) as ReconcilePinnedImagesResponse | { error?: string } | null;
  if (!response.ok || !data || !("ok" in data)) {
    throw new ProxyRequestError(response.status, `Pinned image reconcile failed (${response.status})`, data);
  }

  return data;
}

export async function fetchPinnedImageClientsViaProxy(): Promise<PinnedImageClientUsage[]> {
  const response = await fetch("/api/pinned-images/clients", {
    method: "GET",
    credentials: "include"
  });

  const data = (await response.json().catch(() => null)) as PinnedImageClientsResponse | { error?: string } | null;
  if (!response.ok || !data || !("ok" in data)) {
    throw new ProxyRequestError(response.status, `Pinned image clients request failed (${response.status})`, data);
  }

  return data.clients;
}

export async function prunePinnedImagesViaProxy(payload: PrunePinnedImagesPayload): Promise<PrunePinnedImagesResponse> {
  const response = await fetch("/api/pinned-images/prune", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  const data = (await response.json().catch(() => null)) as PrunePinnedImagesResponse | { error?: string } | null;
  if (!response.ok || !data || !("ok" in data)) {
    throw new ProxyRequestError(response.status, `Pinned image prune request failed (${response.status})`, data);
  }

  return data;
}

export async function previewPrunePinnedImagesViaProxy(payload: PrunePinnedImagesPayload): Promise<PrunePinnedImagesPreviewResponse> {
  const response = await fetch("/api/pinned-images/prune-preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  const data = (await response.json().catch(() => null)) as PrunePinnedImagesPreviewResponse | { error?: string } | null;
  if (!response.ok || !data || !("ok" in data)) {
    throw new ProxyRequestError(response.status, `Pinned image prune preview request failed (${response.status})`, data);
  }

  return data;
}

function parseDownloadFileName(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) {
    return fallback;
  }

  const match = /filename\s*=\s*"?([^";]+)"?/i.exec(contentDisposition);
  if (!match || !match[1]) {
    return fallback;
  }

  return match[1].trim() || fallback;
}

export async function downloadPinnedImagesArchiveViaProxy(clientId?: string): Promise<void> {
  const currentClientId = getOrCreatePinnedImageClientId();
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  const response = await fetch(`/api/pinned-images/archive${query}`, {
    method: "GET",
    credentials: "include",
    headers: {
      "x-chara2img-client-id": currentClientId
    }
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ProxyRequestError(response.status, `Pinned image archive download failed (${response.status})`, data);
  }

  const blob = await response.blob();
  const fallbackName = `${clientId ?? currentClientId}-pinned-images.zip`;
  const fileName = parseDownloadFileName(response.headers.get("content-disposition"), fallbackName);

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadPinnedImagesArchiveBatchViaProxy(clientIds: string[]): Promise<void> {
  const response = await fetch("/api/pinned-images/archive-batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({ clientIds })
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ProxyRequestError(response.status, `Pinned image archive batch download failed (${response.status})`, data);
  }

  const blob = await response.blob();
  const fileName = parseDownloadFileName(response.headers.get("content-disposition"), "selected-clients-pinned-images.zip");

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
