import Dexie, { type Table } from "dexie";

interface CachedImage {
  /** API URL used as the cache key, e.g. "/api/jobs/{jobId}/images/0" */
  cacheKey: string;
  /** Base64 data URL of the image */
  dataUrl: string;
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
  dataUrl: string,
  mimeType: string,
  expiresAt: number
): Promise<void> {
  await db.images.put({ cacheKey, dataUrl, mimeType, expiresAt });
}

/**
 * Retrieve a cached image. Returns null if not found or expired.
 */
export async function getImage(
  cacheKey: string
): Promise<{ dataUrl: string; mimeType: string } | null> {
  const entry = await db.images.get(cacheKey);
  if (!entry || entry.expiresAt <= Date.now()) {
    return null;
  }
  return { dataUrl: entry.dataUrl, mimeType: entry.mimeType };
}

/**
 * Delete all cache entries whose expiresAt is in the past.
 * Called periodically from the poll loop to prevent IndexedDB bloat.
 */
export async function pruneExpiredImageCache(): Promise<void> {
  await db.images.where("expiresAt").below(Date.now()).delete();
}
