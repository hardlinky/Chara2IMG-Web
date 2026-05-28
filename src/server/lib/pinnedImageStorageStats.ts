import { mkdir, readFile, statfs, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(CURRENT_DIR, "../../..");
export const PINNED_IMAGES_DIR = (() => {
  const configured = process.env.PINNED_IMAGES_STORAGE_DIR?.trim();
  if (configured) {
    return resolve(PROJECT_ROOT, configured);
  }

  return resolve(tmpdir(), "chara2img", "pinned-images");
})();

const DEFAULT_PINNED_IMAGES_CAPACITY_BYTES = 10 * 1024 * 1024 * 1024;
const MANIFEST_FILE_PATH = resolve(PINNED_IMAGES_DIR, "manifest.v1.json");

type ManifestEntry = {
  fileName: string;
  clientId: string;
  sizeBytes: number;
  updatedAt: string;
};

type PinnedImagesManifest = {
  version: 1;
  entries: ManifestEntry[];
};

function emptyManifest(): PinnedImagesManifest {
  return {
    version: 1,
    entries: []
  };
}

function normalizeFiniteBytes(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0;
}

export function sanitizeClientId(value: string | null | undefined): string {
  if (!value) {
    return "anonymous";
  }

  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return normalized || "anonymous";
}

async function readManifest(): Promise<PinnedImagesManifest> {
  try {
    await mkdir(PINNED_IMAGES_DIR, { recursive: true });
    const raw = await readFile(MANIFEST_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<PinnedImagesManifest>;

    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return emptyManifest();
    }

    return {
      version: 1,
      entries: parsed.entries
        .filter((entry): entry is ManifestEntry => {
          return (
            Boolean(entry) &&
            typeof entry.fileName === "string" &&
            typeof entry.clientId === "string" &&
            Number.isFinite(Number(entry.sizeBytes)) &&
            typeof entry.updatedAt === "string"
          );
        })
        .map((entry) => ({
          fileName: entry.fileName,
          clientId: sanitizeClientId(entry.clientId),
          sizeBytes: normalizeFiniteBytes(entry.sizeBytes),
          updatedAt: entry.updatedAt
        }))
    };
  } catch {
    return emptyManifest();
  }
}

async function writeManifest(manifest: PinnedImagesManifest): Promise<void> {
  await mkdir(PINNED_IMAGES_DIR, { recursive: true });
  await writeFile(MANIFEST_FILE_PATH, JSON.stringify(manifest));
}

function getConfiguredPinnedImagesCapacityBytes(): number {
  const raw = process.env.PINNED_IMAGES_STORAGE_CAPACITY_BYTES;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_PINNED_IMAGES_CAPACITY_BYTES;
}

async function getPinnedImagesDiskCapacityBytes(): Promise<number | null> {
  try {
    await mkdir(PINNED_IMAGES_DIR, { recursive: true });
    const fsStat = await statfs(PINNED_IMAGES_DIR);
    const blockSize = Number((fsStat as { bsize?: number }).bsize ?? 0);
    const blocks = Number((fsStat as { blocks?: number }).blocks ?? 0);

    if (!Number.isFinite(blockSize) || !Number.isFinite(blocks) || blockSize <= 0 || blocks <= 0) {
      return null;
    }

    return Math.floor(blockSize * blocks);
  } catch {
    return null;
  }
}

export async function getEffectivePinnedImagesCapacityBytes(): Promise<number> {
  const configured = getConfiguredPinnedImagesCapacityBytes();
  const diskCapacity = await getPinnedImagesDiskCapacityBytes();

  if (diskCapacity === null) {
    return configured;
  }

  return Math.max(1, Math.min(configured, diskCapacity));
}

export async function registerPinnedImageBackup(fileName: string, clientId: string, sizeBytes: number): Promise<void> {
  const manifest = await readManifest();
  const normalizedClientId = sanitizeClientId(clientId);
  const normalizedSize = normalizeFiniteBytes(sizeBytes);
  const now = new Date().toISOString();

  const existingIndex = manifest.entries.findIndex((entry) => entry.fileName === fileName);
  const nextEntry: ManifestEntry = {
    fileName,
    clientId: normalizedClientId,
    sizeBytes: normalizedSize,
    updatedAt: now
  };

  if (existingIndex >= 0) {
    manifest.entries[existingIndex] = nextEntry;
  } else {
    manifest.entries.push(nextEntry);
  }

  await writeManifest(manifest);
}

export async function getTrackedPinnedStorageUsageBytes(clientId: string): Promise<{ userUsedBytes: number; allUsersUsedBytes: number }> {
  const manifest = await readManifest();
  const normalizedClientId = sanitizeClientId(clientId);

  let userUsedBytes = 0;
  let allUsersUsedBytes = 0;

  for (const entry of manifest.entries) {
    const size = normalizeFiniteBytes(entry.sizeBytes);
    allUsersUsedBytes += size;
    if (sanitizeClientId(entry.clientId) === normalizedClientId) {
      userUsedBytes += size;
    }
  }

  return {
    userUsedBytes,
    allUsersUsedBytes
  };
}
