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

type PinnedImageStorageStatsResponse = {
  ok: true;
  userUsedBytes: number;
  allUsersUsedBytes: number;
  totalCapacityBytes: number;
};

function getOrCreatePinnedImageClientId(): string {
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
