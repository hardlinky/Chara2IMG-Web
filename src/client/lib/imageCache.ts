import Dexie, { type Table } from "dexie";

interface CachedImage {
  /** API URL used as the cache key, e.g. "/api/jobs/{jobId}/images/0" */
  cacheKey: string;
  /** Raw image bytes. Legacy rows may contain dataUrl instead. */
  blob?: Blob;
  dataUrl?: string;
  mimeType: string;
  /** Epoch ms — matches server expiresAt via JOB_IMAGE_TTL_MS */
  expiresAt: number;
}

class ImageCacheDb extends Dexie {
  images!: Table<CachedImage, string>;

  constructor() {
    super("chara2img-image-cache");
    this.version(1).stores({
      images: "cacheKey, expiresAt",
    });
  }
}

const db = new ImageCacheDb();

/**
 * Persist an image in IndexedDB.
 */
export async function storeImage(
  cacheKey: string,
  blob: Blob,
  mimeType: string,
  expiresAt: number
): Promise<void> {
  await db.images.put({ cacheKey, blob, mimeType, expiresAt });
}

/**
 * Enumerate every entry in the IndexedDB image cache, including expired ones.
 * The admin reconciliation panel must see stale entries as drift, so this does
 * NOT filter by expiry (unlike getImage).
 */
export async function listCachedImages(): Promise<{ cacheKey: string; expiresAt: number }[]> {
  const rows = await db.images.toArray();
  return rows.map((r) => ({ cacheKey: r.cacheKey, expiresAt: r.expiresAt }));
}

/**
 * Retrieve a cached image. Returns null if not found or expired.
 */
export async function getImage(
  cacheKey: string
): Promise<{ blob: Blob; mimeType: string } | null> {
  const entry = await db.images.get(cacheKey);
  if (!entry || entry.expiresAt <= Date.now()) {
    return null;
  }
  if (entry.blob) {
    return { blob: entry.blob, mimeType: entry.mimeType };
  }
  if (!entry.dataUrl) {
    return null;
  }

  try {
    const response = await fetch(entry.dataUrl);
    const blob = await response.blob();
    const migratedBlob = blob.type ? blob : new Blob([blob], { type: entry.mimeType });
    await db.images.put({
      cacheKey: entry.cacheKey,
      blob: migratedBlob,
      mimeType: entry.mimeType,
      expiresAt: entry.expiresAt
    });
    return { blob: migratedBlob, mimeType: entry.mimeType };
  } catch {
    await db.images.delete(cacheKey);
    return null;
  }
}

/**
 * Delete all cache entries whose expiresAt is in the past.
 * Called periodically from the poll loop to prevent IndexedDB bloat.
 */
export async function pruneExpiredImageCache(): Promise<void> {
  await db.images.where("expiresAt").below(Date.now()).delete();
}

/**
 * Delete a single cached image by its cache key (API URL).
 * Called after a successful pin operation to evict the local copy
 * before the image moves to the server's persistent archive.
 */
export async function deleteImage(cacheKey: string): Promise<void> {
  await db.images.delete(cacheKey);
}

/**
 * Wipe every entry from the IndexedDB image cache. Purely local — images are
 * re-fetched from the server on next render. Returns the number of entries removed.
 */
export async function clearImageCache(): Promise<number> {
  const count = await db.images.count();
  await db.images.clear();
  return count;
}
