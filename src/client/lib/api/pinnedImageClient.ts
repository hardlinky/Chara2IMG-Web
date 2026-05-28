import { ProxyRequestError } from "./runpodProxyClient";

type BackupPinnedImagePayload = {
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

export async function backupPinnedImageViaProxy(payload: BackupPinnedImagePayload): Promise<BackupPinnedImageResponse> {
  const response = await fetch("/api/pinned-images/backup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  const data = (await response.json().catch(() => null)) as BackupPinnedImageResponse | { error?: string } | null;
  if (!response.ok || !data || !("ok" in data)) {
    throw new ProxyRequestError(response.status, `Pinned image backup failed (${response.status})`, data);
  }

  return data;
}
