import { JOB_IMAGE_TTL_MS, type JobManifestEntry } from "../../../shared/contracts/jobs";
import { storeImage } from "../imageCache";

/**
 * Build the cache key / fetch URL for a single job output image.
 * This IS the URL used to GET the raw image bytes from the server.
 */
export function imageCacheKey(jobId: string, index: number): string {
  return `/api/jobs/${jobId}/images/${index}`;
}

/**
 * Parse a cache key back into its jobId + index parts.
 * Returns null when the key does not match the expected format.
 */
export function parseImageCacheKey(cacheKey: string): { jobId: string; index: number } | null {
  const match = /^\/api\/jobs\/(.+)\/images\/(\d+)$/.exec(cacheKey);
  if (!match) {
    return null;
  }
  return { jobId: match[1], index: Number(match[2]) };
}

/**
 * Fetch the server-side admin manifest (the LEFT column of the panel).
 */
export async function fetchAdminManifest(): Promise<JobManifestEntry[]> {
  const res = await fetch("/api/admin/manifest", { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to fetch admin manifest: ${res.status}`);
  }
  const body = (await res.json()) as { ok: boolean; jobs: JobManifestEntry[] };
  return body.jobs;
}

/**
 * Purge a single image from the server (tmp + archive dirs).
 */
export async function deleteServerImage(jobId: string, index: number): Promise<void> {
  const res = await fetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/images/${index}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!res.ok) {
    throw new Error(`Failed to delete server image ${jobId}:${index}: ${res.status}`);
  }
}

/**
 * Copy a server image into the client IndexedDB cache.
 * Stores the raw Blob with a fresh TTL.
 */
export async function recacheImageFromServer(jobId: string, index: number): Promise<void> {
  const cacheKey = imageCacheKey(jobId, index);
  const res = await fetch(cacheKey, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to fetch server image ${jobId}:${index}: ${res.status}`);
  }

  const blob = await res.blob();
  const mimeType = blob.type || "image/png";
  await storeImage(cacheKey, blob, mimeType, Date.now() + JOB_IMAGE_TTL_MS);
}
