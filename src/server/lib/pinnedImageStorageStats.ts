import { mkdir, readFile, readdir, rm, stat, statfs, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(CURRENT_DIR, "../../..");
export const PINNED_IMAGES_DIR = (() => {
  const configured = process.env.PINNED_IMAGES_STORAGE_DIR?.trim();
  if (configured) {
    return resolve(PROJECT_ROOT, configured);
  }

  // Default to a persistent directory outside the repo so the data survives
  // git clone re-deployments (which do `rm -rf <repo>` before cloning).
  return resolve(PROJECT_ROOT, "../chara2img/pinned-images");
})();

const DEFAULT_PINNED_IMAGES_CAPACITY_BYTES = 10 * 1024 * 1024 * 1024;
const MANIFEST_FILE_PATH = resolve(PINNED_IMAGES_DIR, "manifest.v1.json");
const CLIENT_MANIFESTS_DIR = resolve(PINNED_IMAGES_DIR, "manifests");

type ManifestEntry = {
  fileName: string;
  clientId: string;
  contentHash: string;
  sizeBytes: number;
  refCount: number;
  consumers: string[];
  updatedAt: string;
  workflowFileName?: string;
  workflowTemplate?: Record<string, unknown>;
  workflowInputs?: Record<string, unknown>;
  workflowJson?: Record<string, unknown>;
};

type PinnedImagesManifest = {
  version: 1;
  entries: ManifestEntry[];
};

type ClientManifestEntry = Omit<ManifestEntry, "clientId">;

type ClientPinnedImagesManifest = {
  version: 1;
  clientId: string;
  entries: ClientManifestEntry[];
};

function emptyManifest(): PinnedImagesManifest {
  return {
    version: 1,
    entries: []
  };
}

function getClientManifestFileName(clientId: string): string {
  return `${sanitizeClientId(clientId)}.manifest.v1.json`;
}

function getClientManifestFilePath(clientId: string): string {
  return resolve(CLIENT_MANIFESTS_DIR, getClientManifestFileName(clientId));
}

function isClientManifestFileName(fileName: string): boolean {
  return /^[a-zA-Z0-9_-]+\.manifest\.v1\.json$/u.test(fileName);
}

function normalizeManifestEntries(entries: unknown[], fallbackClientId?: string): ManifestEntry[] {
  return entries
    .filter((entry): entry is ManifestEntry => {
      if (!entry || typeof entry !== "object") {
        return false;
      }

      const record = entry as Partial<ManifestEntry>;
      const entryClientId = typeof record.clientId === "string" ? record.clientId : fallbackClientId;

      return (
        typeof record.fileName === "string" &&
        typeof entryClientId === "string" &&
        typeof record.contentHash === "string" &&
        Number.isFinite(Number(record.sizeBytes)) &&
        Number.isFinite(Number(record.refCount ?? 1)) &&
        (!("consumers" in record) || Array.isArray((record as { consumers?: unknown }).consumers)) &&
        typeof record.updatedAt === "string"
      );
    })
    .map((entry) => ({
      fileName: entry.fileName,
      clientId: sanitizeClientId(entry.clientId ?? fallbackClientId),
      contentHash: entry.contentHash,
      sizeBytes: normalizeFiniteBytes(entry.sizeBytes),
      refCount: Math.max(1, normalizeFiniteBytes(entry.refCount ?? 1)),
      consumers: Array.isArray(entry.consumers)
        ? [...new Set(entry.consumers.filter((consumer): consumer is string => typeof consumer === "string" && consumer.trim().length > 0))]
        : [],
      updatedAt: entry.updatedAt,
      workflowFileName:
        typeof (entry as { workflowFileName?: unknown }).workflowFileName === "string"
          ? sanitizeWorkflowFileName((entry as { workflowFileName?: unknown }).workflowFileName as string)
          : undefined,
      workflowTemplate: isWorkflowJson((entry as { workflowTemplate?: unknown }).workflowTemplate)
        ? (entry as { workflowTemplate: Record<string, unknown> }).workflowTemplate
        : undefined,
      workflowInputs: isWorkflowJson((entry as { workflowInputs?: unknown }).workflowInputs)
        ? (entry as { workflowInputs: Record<string, unknown> }).workflowInputs
        : undefined,
      workflowJson: isWorkflowJson((entry as { workflowJson?: unknown }).workflowJson)
        ? (entry as { workflowJson: Record<string, unknown> }).workflowJson
        : undefined
    }));
}

function isWorkflowJson(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeWorkflowFileName(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "workflow";
}

function normalizeWorkflowJson(value: unknown): Record<string, unknown> | undefined {
  return isWorkflowJson(value) ? value : undefined;
}

function dedupeManifestEntries(entries: ManifestEntry[]): ManifestEntry[] {
  const byKey = new Map<string, ManifestEntry>();

  for (const entry of entries) {
    const key = `${sanitizeClientId(entry.clientId)}:${entry.fileName}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      continue;
    }

    byKey.set(key, Date.parse(entry.updatedAt) >= Date.parse(existing.updatedAt) ? entry : existing);
  }

  return [...byKey.values()];
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
  const perClientEntries: ManifestEntry[] = [];

  try {
    await mkdir(PINNED_IMAGES_DIR, { recursive: true });
    await mkdir(CLIENT_MANIFESTS_DIR, { recursive: true });

    const clientManifestFiles = await readdir(CLIENT_MANIFESTS_DIR);
    for (const fileName of clientManifestFiles) {
      if (!isClientManifestFileName(fileName)) {
        continue;
      }

      try {
        const raw = await readFile(resolve(CLIENT_MANIFESTS_DIR, fileName), "utf8");
        const parsed = JSON.parse(raw) as Partial<ClientPinnedImagesManifest>;
        const fallbackClientId = sanitizeClientId((parsed.clientId ?? fileName.split(".")[0]) as string);
        if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
          continue;
        }

        perClientEntries.push(...normalizeManifestEntries(parsed.entries, fallbackClientId));
      } catch {
        // Skip invalid client manifest files.
      }
    }
  } catch {
    return emptyManifest();
  }

  let legacyEntries: ManifestEntry[] = [];

  try {
    const raw = await readFile(MANIFEST_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<PinnedImagesManifest>;

    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return {
        version: 1,
        entries: dedupeManifestEntries(perClientEntries)
      };
    }

    legacyEntries = normalizeManifestEntries(parsed.entries);
  } catch {
    legacyEntries = [];
  }

  return {
    version: 1,
    entries: dedupeManifestEntries([...perClientEntries, ...legacyEntries])
  };
}

async function writeManifest(manifest: PinnedImagesManifest): Promise<void> {
  await mkdir(PINNED_IMAGES_DIR, { recursive: true });
  await mkdir(CLIENT_MANIFESTS_DIR, { recursive: true });

  const groupedByClient = new Map<string, ClientManifestEntry[]>();
  for (const entry of manifest.entries) {
    const normalizedClientId = sanitizeClientId(entry.clientId);
    const current = groupedByClient.get(normalizedClientId) ?? [];
    current.push({
      fileName: entry.fileName,
      contentHash: entry.contentHash,
      sizeBytes: normalizeFiniteBytes(entry.sizeBytes),
      refCount: Math.max(1, normalizeFiniteBytes(entry.refCount ?? 1)),
      consumers: Array.isArray(entry.consumers)
        ? [...new Set(entry.consumers.filter((consumer): consumer is string => typeof consumer === "string" && consumer.trim().length > 0))]
        : [],
      updatedAt: entry.updatedAt,
      workflowFileName: entry.workflowFileName,
      workflowTemplate: entry.workflowTemplate,
      workflowInputs: entry.workflowInputs,
      workflowJson: entry.workflowJson
    });
    groupedByClient.set(normalizedClientId, current);
  }

  let existingManifestFiles: string[] = [];
  try {
    existingManifestFiles = await readdir(CLIENT_MANIFESTS_DIR);
  } catch {
    existingManifestFiles = [];
  }

  const nextManifestFiles = new Set<string>();
  for (const [clientId, entries] of groupedByClient.entries()) {
    const fileName = getClientManifestFileName(clientId);
    nextManifestFiles.add(fileName);

    const clientManifest: ClientPinnedImagesManifest = {
      version: 1,
      clientId,
      entries: entries.sort((left, right) => left.fileName.localeCompare(right.fileName))
    };

    await writeFile(getClientManifestFilePath(clientId), `${JSON.stringify(clientManifest, null, 2)}\n`, "utf8");
  }

  for (const existingFile of existingManifestFiles) {
    if (!isClientManifestFileName(existingFile) || nextManifestFiles.has(existingFile)) {
      continue;
    }

    await rm(resolve(CLIENT_MANIFESTS_DIR, existingFile), { force: true });
  }

  const writtenClientIds = new Set(groupedByClient.keys());
  try {
    const raw = await readFile(MANIFEST_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<PinnedImagesManifest>;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      await rm(MANIFEST_FILE_PATH, { force: true });
      return;
    }

    const normalizedLegacy = normalizeManifestEntries(parsed.entries);
    const remainingLegacyEntries = normalizedLegacy.filter(
      (entry) => !writtenClientIds.has(sanitizeClientId(entry.clientId))
    );

    if (remainingLegacyEntries.length === 0) {
      await rm(MANIFEST_FILE_PATH, { force: true });
      return;
    }

    const legacyManifest: PinnedImagesManifest = {
      version: 1,
      entries: dedupeManifestEntries(remainingLegacyEntries)
    };
    await writeFile(MANIFEST_FILE_PATH, `${JSON.stringify(legacyManifest, null, 2)}\n`, "utf8");
  } catch {
    await rm(MANIFEST_FILE_PATH, { force: true });
  }
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

function normalizeConsumerKey(value: string): string {
  return value.trim();
}

export function buildPinnedImageConsumerKey(clientId: string, jobId: string, outputIndex: number): string {
  return `${sanitizeClientId(clientId)}:${jobId}:${Math.max(0, Math.floor(outputIndex))}`;
}

export async function registerPinnedImageBackup(
  fileName: string,
  clientId: string,
  sizeBytes: number,
  contentHash: string,
  consumerKey: string,
  workflowMetadata?: {
    workflowFileName?: string;
    workflowTemplate?: Record<string, unknown>;
    workflowInputs?: Record<string, unknown>;
    workflowJson?: Record<string, unknown>;
  }
): Promise<void> {
  const manifest = await readManifest();
  const normalizedClientId = sanitizeClientId(clientId);
  const normalizedSize = normalizeFiniteBytes(sizeBytes);
  const normalizedConsumer = normalizeConsumerKey(consumerKey);
  const now = new Date().toISOString();
  const workflowFileName = typeof workflowMetadata?.workflowFileName === "string"
    ? sanitizeWorkflowFileName(workflowMetadata.workflowFileName)
    : undefined;
  const workflowTemplate = normalizeWorkflowJson(workflowMetadata?.workflowTemplate);
  const workflowInputs = normalizeWorkflowJson(workflowMetadata?.workflowInputs);
  const workflowJson = normalizeWorkflowJson(workflowMetadata?.workflowJson);

  const existingIndex = manifest.entries.findIndex((entry) => entry.fileName === fileName);
  const nextEntry: ManifestEntry = {
    fileName,
    clientId: normalizedClientId,
    contentHash,
    sizeBytes: normalizedSize,
    refCount: 1,
    consumers: [normalizedConsumer],
    updatedAt: now,
    workflowFileName,
    workflowTemplate,
    workflowInputs,
    workflowJson
  };

  if (existingIndex >= 0) {
    const existing = manifest.entries[existingIndex]!;
    const nextConsumers = existing.consumers.includes(normalizedConsumer)
      ? existing.consumers
      : [...existing.consumers, normalizedConsumer];

    manifest.entries[existingIndex] = {
      ...existing,
      clientId: normalizedClientId,
      contentHash,
      sizeBytes: normalizedSize,
      refCount: nextConsumers.length > 0 ? nextConsumers.length : Math.max(1, existing.refCount),
      consumers: nextConsumers,
      updatedAt: now,
      workflowFileName: workflowFileName ?? existing.workflowFileName,
      workflowTemplate: workflowTemplate ?? existing.workflowTemplate,
      workflowInputs: workflowInputs ?? existing.workflowInputs,
      workflowJson: workflowJson ?? existing.workflowJson
    };
  } else {
    manifest.entries.push(nextEntry);
  }

  await writeManifest(manifest);
}

export async function findPinnedImageByHash(clientId: string, contentHash: string): Promise<ManifestEntry | null> {
  const manifest = await readManifest();
  const normalizedClientId = sanitizeClientId(clientId);
  return (
    manifest.entries.find((entry) => sanitizeClientId(entry.clientId) === normalizedClientId && entry.contentHash === contentHash) ?? null
  );
}

async function listOrphanedImageFiles(manifest: PinnedImagesManifest): Promise<Array<{ fileName: string; sizeBytes: number }>> {
  const manifestFileNames = new Set(manifest.entries.map((entry) => entry.fileName));

  let files: string[];
  try {
    files = await readdir(PINNED_IMAGES_DIR);
  } catch {
    return [];
  }

  const orphans: Array<{ fileName: string; sizeBytes: number }> = [];

  for (const file of files) {
    if (file === "manifest.v1.json" || file === "manifests") {
      continue;
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(file)) {
      continue;
    }

    if (manifestFileNames.has(file)) {
      continue;
    }

    try {
      const fileStat = await stat(resolve(PINNED_IMAGES_DIR, file));
      orphans.push({ fileName: file, sizeBytes: fileStat.size });
    } catch {
      // Skip unreadable files.
    }
  }

  return orphans;
}

export async function purgeMissingPinnedImages(): Promise<{ removedEntries: number; checkedEntries: number }> {
  const manifest = await readManifest();
  const nextEntries: ManifestEntry[] = [];
  let removedEntries = 0;

  await Promise.all(
    manifest.entries.map(async (entry) => {
      const filePath = resolve(PINNED_IMAGES_DIR, entry.fileName);
      if (!filePath.startsWith(PINNED_IMAGES_DIR)) {
        removedEntries += 1;
        return;
      }

      try {
        await stat(filePath);
        nextEntries.push(entry);
      } catch {
        removedEntries += 1;
      }
    })
  );

  if (removedEntries > 0) {
    manifest.entries = nextEntries;
    await writeManifest(manifest);
  }

  return { removedEntries, checkedEntries: nextEntries.length + removedEntries };
}

export async function purgeMissingPinnedImagesForClient(clientId: string): Promise<{ removedEntries: number; checkedEntries: number }> {
  const manifest = await readManifest();
  const normalizedClientId = sanitizeClientId(clientId);
  const nextEntries: ManifestEntry[] = [];
  let removedEntries = 0;

  await Promise.all(
    manifest.entries.map(async (entry) => {
      if (sanitizeClientId(entry.clientId) !== normalizedClientId) {
        nextEntries.push(entry);
        return;
      }

      const filePath = resolve(PINNED_IMAGES_DIR, entry.fileName);
      if (!filePath.startsWith(PINNED_IMAGES_DIR)) {
        removedEntries += 1;
        return;
      }

      try {
        await stat(filePath);
        nextEntries.push(entry);
      } catch {
        removedEntries += 1;
      }
    })
  );

  const checkedEntries = manifest.entries.filter((e) => sanitizeClientId(e.clientId) === normalizedClientId).length;

  if (removedEntries > 0) {
    manifest.entries = nextEntries;
    await writeManifest(manifest);
  }

  return { removedEntries, checkedEntries };
}

export async function findPinnedImageByFileName(clientId: string, fileName: string): Promise<ManifestEntry | null> {
  const manifest = await readManifest();
  const normalizedClientId = sanitizeClientId(clientId);
  return manifest.entries.find((entry) => sanitizeClientId(entry.clientId) === normalizedClientId && entry.fileName === fileName) ?? null;
}

export async function listPinnedImageEntriesForClient(clientId: string): Promise<Array<{
  fileName: string;
  contentHash: string;
  sizeBytes: number;
  refCount: number;
  consumers: string[];
  updatedAt: string;
  workflowFileName?: string;
  workflowTemplate?: Record<string, unknown>;
  workflowInputs?: Record<string, unknown>;
  workflowJson?: Record<string, unknown>;
}>> {
  const manifest = await readManifest();
  const normalizedClientId = sanitizeClientId(clientId);

  return manifest.entries
    .filter((entry) => sanitizeClientId(entry.clientId) === normalizedClientId)
    .map((entry) => ({
      fileName: entry.fileName,
      contentHash: entry.contentHash,
      sizeBytes: normalizeFiniteBytes(entry.sizeBytes),
      refCount: Math.max(1, normalizeFiniteBytes(entry.refCount ?? 1)),
      consumers: [...entry.consumers],
      updatedAt: entry.updatedAt,
      workflowFileName: entry.workflowFileName,
      workflowTemplate: entry.workflowTemplate,
      workflowInputs: entry.workflowInputs,
      workflowJson: entry.workflowJson
    }))
    .sort((left, right) => left.fileName.localeCompare(right.fileName));
}

export async function releasePinnedImageReference(fileName: string, clientId: string, consumerKey: string): Promise<{ shouldDeleteFile: boolean }> {
  const manifest = await readManifest();
  const normalizedClientId = sanitizeClientId(clientId);
  const normalizedConsumer = normalizeConsumerKey(consumerKey);
  const index = manifest.entries.findIndex((entry) => entry.fileName === fileName && sanitizeClientId(entry.clientId) === normalizedClientId);
  if (index < 0) {
    return { shouldDeleteFile: false };
  }

  const target = manifest.entries[index]!;
  const currentConsumers = target.consumers;
  const hadConsumer = currentConsumers.includes(normalizedConsumer);
  const nextConsumers = hadConsumer ? currentConsumers.filter((consumer) => consumer !== normalizedConsumer) : currentConsumers;

  const currentRefCount = Math.max(1, normalizeFiniteBytes(target.refCount));
  const nextRefCount = nextConsumers.length > 0 ? nextConsumers.length : hadConsumer ? 0 : Math.max(0, currentRefCount - 1);

  if (nextRefCount <= 0) {
    manifest.entries.splice(index, 1);
    await writeManifest(manifest);
    return { shouldDeleteFile: true };
  }

  target.refCount = nextRefCount;
  target.consumers = nextConsumers;
  target.updatedAt = new Date().toISOString();
  await writeManifest(manifest);
  return { shouldDeleteFile: false };
}

export async function reconcilePinnedImageConsumersForClient(
  clientId: string,
  refs: Array<{ fileName: string; consumerKey: string }>
): Promise<{ filesToDelete: string[]; reconciledEntries: number }> {
  const manifest = await readManifest();
  const normalizedClientId = sanitizeClientId(clientId);

  const activeConsumersByFile = new Map<string, Set<string>>();
  for (const ref of refs) {
    const normalizedConsumer = normalizeConsumerKey(ref.consumerKey);
    const set = activeConsumersByFile.get(ref.fileName) ?? new Set<string>();
    set.add(normalizedConsumer);
    activeConsumersByFile.set(ref.fileName, set);
  }

  const filesToDelete: string[] = [];
  let reconciledEntries = 0;
  const nextEntries: ManifestEntry[] = [];

  for (const entry of manifest.entries) {
    if (sanitizeClientId(entry.clientId) !== normalizedClientId) {
      nextEntries.push(entry);
      continue;
    }

    const activeConsumers = activeConsumersByFile.get(entry.fileName) ?? new Set<string>();
    const currentConsumers = entry.consumers.length > 0 ? entry.consumers : [];
    const nextConsumers = currentConsumers.filter((consumer) => activeConsumers.has(consumer));

    reconciledEntries += 1;
    if (nextConsumers.length === 0) {
      filesToDelete.push(entry.fileName);
      continue;
    }

    nextEntries.push({
      ...entry,
      consumers: nextConsumers,
      refCount: nextConsumers.length,
      updatedAt: new Date().toISOString()
    });
  }

  manifest.entries = nextEntries;
  await writeManifest(manifest);

  return {
    filesToDelete: [...new Set(filesToDelete)],
    reconciledEntries
  };
}

export async function listPinnedImageClientUsage(): Promise<Array<{ clientId: string; entries: number; bytes: number }>> {
  const manifest = await readManifest();
  const usage = new Map<string, { entries: number; bytes: number }>();

  for (const entry of manifest.entries) {
    const clientId = sanitizeClientId(entry.clientId);
    const current = usage.get(clientId) ?? { entries: 0, bytes: 0 };
    current.entries += 1;
    current.bytes += normalizeFiniteBytes(entry.sizeBytes);
    usage.set(clientId, current);
  }

  return [...usage.entries()]
    .map(([clientId, summary]) => ({
      clientId,
      entries: summary.entries,
      bytes: summary.bytes
    }))
    .sort((left, right) => right.bytes - left.bytes || left.clientId.localeCompare(right.clientId));
}

export async function previewPrunePinnedImagesToClients(
  keepClientIds: string[]
): Promise<{
  keptEntries: number;
  keptBytes: number;
  keptClients: string[];
  removedEntries: number;
  removedBytes: number;
  removedClients: string[];
  orphanedFiles: number;
  orphanedBytes: number;
}> {
  const manifest = await readManifest();
  const keepSet = new Set(keepClientIds.map((value) => sanitizeClientId(value)));

  let keptEntries = 0;
  let keptBytes = 0;
  let removedEntries = 0;
  let removedBytes = 0;
  const keptClients = new Set<string>();
  const removedClients = new Set<string>();

  for (const entry of manifest.entries) {
    const entryClientId = sanitizeClientId(entry.clientId);
    const sizeBytes = normalizeFiniteBytes(entry.sizeBytes);

    if (keepSet.has(entryClientId)) {
      keptEntries += 1;
      keptBytes += sizeBytes;
      keptClients.add(entryClientId);
      continue;
    }

    removedEntries += 1;
    removedBytes += sizeBytes;
    removedClients.add(entryClientId);
  }

  const orphans = await listOrphanedImageFiles(manifest);
  const orphanedFiles = orphans.length;
  const orphanedBytes = orphans.reduce((sum, orphan) => sum + orphan.sizeBytes, 0);

  return {
    keptEntries,
    keptBytes,
    keptClients: [...keptClients].sort((left, right) => left.localeCompare(right)),
    removedEntries,
    removedBytes,
    removedClients: [...removedClients].sort((left, right) => left.localeCompare(right)),
    orphanedFiles,
    orphanedBytes
  };
}

export async function prunePinnedImagesToClients(
  keepClientIds: string[]
): Promise<{ removedEntries: number; keptEntries: number; filesToDelete: string[]; removedClients: string[]; orphanedFilesDeleted: number }> {
  const manifest = await readManifest();
  const keepSet = new Set(keepClientIds.map((value) => sanitizeClientId(value)));

  let removedEntries = 0;
  const filesToDelete = new Set<string>();
  const removedClients = new Set<string>();
  const nextEntries: ManifestEntry[] = [];

  for (const entry of manifest.entries) {
    const entryClientId = sanitizeClientId(entry.clientId);
    if (keepSet.has(entryClientId)) {
      nextEntries.push(entry);
      continue;
    }

    removedEntries += 1;
    filesToDelete.add(entry.fileName);
    removedClients.add(entryClientId);
  }

  const orphans = await listOrphanedImageFiles(manifest);
  for (const orphan of orphans) {
    filesToDelete.add(orphan.fileName);
  }

  manifest.entries = nextEntries;
  await writeManifest(manifest);

  return {
    removedEntries,
    keptEntries: nextEntries.length,
    filesToDelete: [...filesToDelete],
    removedClients: [...removedClients].sort((left, right) => left.localeCompare(right)),
    orphanedFilesDeleted: orphans.length
  };
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
