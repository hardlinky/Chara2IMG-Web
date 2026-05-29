import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import type { Hono } from "hono";
import { hasAdminSession, requireAdminSession, requireInvitedSession } from "../middleware/session";
import yazl from "yazl";
import {
  buildPinnedImageConsumerKey,
  findPinnedImageByFileName,
  findPinnedImageByHash,
  getEffectivePinnedImagesCapacityBytes,
  listPinnedImageEntriesForClient,
  listPinnedImageClientUsage,
  PINNED_IMAGES_DIR,
  previewPrunePinnedImagesToClients,
  prunePinnedImagesToClients,
  reconcilePinnedImageConsumersForClient,
  releasePinnedImageReference,
  getTrackedPinnedStorageUsageBytes,
  registerPinnedImageBackup,
  sanitizeClientId
} from "../lib/pinnedImageStorageStats";
import { logServerWarning } from "../lib/logger";
import {
  backupPinnedImageRequestSchema,
  prunePinnedImagesRequestSchema,
  reconcilePinnedImagesRequestSchema,
  releasePinnedImageRequestSchema
} from "../schemas/pinnedImages";

function sanitizeWorkflowExport(workflow: Record<string, unknown>): Record<string, unknown> {
  const cloned = structuredClone(workflow) as Record<string, unknown>;

  for (const node of Object.values(cloned)) {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      continue;
    }

    const inputs = (node as { inputs?: unknown }).inputs;
    if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
      continue;
    }

    for (const [key, value] of Object.entries(inputs as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase();
      const normalizedValue = typeof value === "string" ? value.trim().toLowerCase() : "";

      if (!normalizedValue) {
        continue;
      }

      if (normalizedValue.startsWith("data:image/") || normalizedKey === "base64_data") {
        (inputs as Record<string, unknown>)[key] = "";
      }
    }
  }

  return cloned;
}

function getRequestClientId(request: Request, fallbackClientId?: string | null): string {
  if (fallbackClientId) {
    return sanitizeClientId(fallbackClientId);
  }

  const headerValue = request.headers.get("x-chara2img-client-id");
  return sanitizeClientId(headerValue);
}

function mimeTypeToExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/png":
    default:
      return "png";
  }
}

function decodeDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl.trim());
  if (!match) {
    return null;
  }

  const [, mimeType, payload] = match;
  try {
    const buffer = Buffer.from(payload, "base64");
    return {
      mimeType,
      bytes: Uint8Array.from(buffer)
    };
  } catch {
    return null;
  }
}

function computeContentHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sanitizeArchiveFileNamePart(value: string | undefined, fallback: string): string {
  const source = (value ?? fallback).trim();
  const sanitized = source.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return sanitized || fallback;
}

function formatArchiveTimestamp(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  const hours = `${date.getUTCHours()}`.padStart(2, "0");
  const minutes = `${date.getUTCMinutes()}`.padStart(2, "0");
  const seconds = `${date.getUTCSeconds()}`.padStart(2, "0");

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function buildWorkflowArchivePayload(entry: {
  workflowTemplate?: Record<string, unknown>;
  workflowInputs?: Record<string, unknown>;
  workflowJson?: Record<string, unknown>;
}): Record<string, unknown> | null {
  if (entry.workflowTemplate) {
    if (entry.workflowInputs && Object.keys(entry.workflowInputs).length > 0) {
      return sanitizeWorkflowExport({
        workflow: entry.workflowTemplate,
        ...entry.workflowInputs
      });
    }

    return sanitizeWorkflowExport(entry.workflowTemplate);
  }

  return entry.workflowJson ? sanitizeWorkflowExport(entry.workflowJson) : null;
}

type TransientPinnedArchiveItem = {
  jobId: string;
  outputIndex: number;
  dataUrl: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  workflowTemplateFileName?: string;
  workflowInputs?: Record<string, unknown>;
  workflowJson?: Record<string, unknown>;
};

type TransientPinnedArchiveWorkflow = {
  workflowFileName: string;
  workflowTemplate?: Record<string, unknown>;
  workflowJson?: Record<string, unknown>;
};

function parseTransientPinnedArchiveItems(payload: unknown): TransientPinnedArchiveItem[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const rawItems = (payload as { transientPinnedItems?: unknown }).transientPinnedItems;
  if (!Array.isArray(rawItems)) {
    return [];
  }

  const parsedItems = rawItems
    .map((item): TransientPinnedArchiveItem | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const jobId = typeof record.jobId === "string" ? record.jobId : "";
      const outputIndex = Number(record.outputIndex);
      const dataUrl = typeof record.dataUrl === "string" ? record.dataUrl : "";
      const mimeType = record.mimeType;
      const validMimeType = mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp" || mimeType === "image/gif";

      if (!jobId || !Number.isInteger(outputIndex) || outputIndex < 0 || !dataUrl.startsWith("data:") || !validMimeType) {
        return null;
      }

      const parsedItem: TransientPinnedArchiveItem = {
        jobId,
        outputIndex,
        dataUrl,
        mimeType
      };

      if (typeof record.workflowTemplateFileName === "string" && record.workflowTemplateFileName.trim()) {
        parsedItem.workflowTemplateFileName = record.workflowTemplateFileName.trim();
      }
      if (record.workflowInputs && typeof record.workflowInputs === "object" && !Array.isArray(record.workflowInputs)) {
        parsedItem.workflowInputs = record.workflowInputs as Record<string, unknown>;
      }
      if (record.workflowJson && typeof record.workflowJson === "object" && !Array.isArray(record.workflowJson)) {
        parsedItem.workflowJson = record.workflowJson as Record<string, unknown>;
      }

      return parsedItem;
    })
    .filter((item): item is TransientPinnedArchiveItem => item !== null);

  return parsedItems;
}

function parseTransientPinnedWorkflows(payload: unknown): Map<string, TransientPinnedArchiveWorkflow> {
  if (!payload || typeof payload !== "object") {
    return new Map();
  }

  const rawItems = (payload as { transientWorkflows?: unknown }).transientWorkflows;
  if (!Array.isArray(rawItems)) {
    return new Map();
  }

  const workflowsByFileName = new Map<string, TransientPinnedArchiveWorkflow>();
  for (const item of rawItems) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const workflowFileName = typeof record.workflowFileName === "string" ? record.workflowFileName.trim() : "";
    if (!workflowFileName) {
      continue;
    }

    const workflow: TransientPinnedArchiveWorkflow = { workflowFileName };
    if (record.workflowTemplate && typeof record.workflowTemplate === "object" && !Array.isArray(record.workflowTemplate)) {
      workflow.workflowTemplate = record.workflowTemplate as Record<string, unknown>;
    }
    if (record.workflowJson && typeof record.workflowJson === "object" && !Array.isArray(record.workflowJson)) {
      workflow.workflowJson = record.workflowJson as Record<string, unknown>;
    }

    workflowsByFileName.set(workflowFileName, workflow);
  }

  return workflowsByFileName;
}

function parseArchivedPinnedFileNames(payload: unknown): Set<string> | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const rawFileNames = (payload as { archivedPinnedFileNames?: unknown }).archivedPinnedFileNames;
  if (!Array.isArray(rawFileNames)) {
    return null;
  }

  const parsed = rawFileNames
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => /^[a-zA-Z0-9._-]+$/.test(value));

  return new Set(parsed);
}

function computeWorkflowPayloadKey(jobId: string, payload: Record<string, unknown>): string {
  return `${jobId}:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

function parseConsumerKey(consumerKey: string): { jobId: string; outputIndex: number } | null {
  const parts = consumerKey.split(":");
  if (parts.length !== 3) {
    return null;
  }

  const outputIndex = Number(parts[2]);
  if (!Number.isInteger(outputIndex) || outputIndex < 0) {
    return null;
  }

  return {
    jobId: parts[1] ?? "job",
    outputIndex
  };
}

function parsePinnedImageFileNameFromUrl(imageUrl: string): string | null {
  const trimmed = imageUrl.trim();
  const decoded = decodeURIComponent(trimmed);
  const marker = "/api/pinned-images/";
  const index = decoded.indexOf(marker);
  if (index < 0) {
    return null;
  }

  const suffix = decoded.slice(index + marker.length);
  const fileName = suffix.split("?")[0]?.split("#")[0] ?? "";
  if (!fileName || !/^[a-zA-Z0-9._-]+$/.test(fileName)) {
    return null;
  }

  return fileName;
}

async function selfHealPinnedManifestForClient(
  clientId: string,
  existingEntries: Array<{ fileName: string; consumers: string[] }>
): Promise<void> {
  const refs = existingEntries.flatMap((entry) =>
    entry.consumers.map((consumerKey) => ({
      fileName: entry.fileName,
      consumerKey
    }))
  );

  const reconcileResult = await reconcilePinnedImageConsumersForClient(clientId, refs);
  await Promise.all(
    reconcileResult.filesToDelete.map(async (fileName) => {
      const filePath = resolve(PINNED_IMAGES_DIR, fileName);
      if (!filePath.startsWith(PINNED_IMAGES_DIR)) {
        return;
      }

      await unlink(filePath).catch((error) => {
        logServerWarning("Failed to delete self-healed stale pinned image file", error, {
          fileName,
          clientId
        });
      });
    })
  );
}

export function registerPinnedImageRoutes(app: Hono): void {
  app.get("/api/pinned-images/stats", async (c) => {
    const clientId = getRequestClientId(c.req.raw, c.req.query("clientId"));
    const usage = await getTrackedPinnedStorageUsageBytes(clientId);
    const totalCapacityBytes = await getEffectivePinnedImagesCapacityBytes();

    return c.json({
      ok: true,
      userUsedBytes: usage.userUsedBytes,
      allUsersUsedBytes: usage.allUsersUsedBytes,
      totalCapacityBytes
    });
  });

  app.use("/api/pinned-images/backup", requireInvitedSession);
  app.post("/api/pinned-images/backup", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = backupPinnedImageRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid pinned image backup request" }, 400);
    }

    const clientId = getRequestClientId(c.req.raw, parsed.data.clientId ?? null);
    const consumerKey = buildPinnedImageConsumerKey(clientId, parsed.data.jobId, parsed.data.outputIndex);
    const workflowMetadata = parsed.data.workflowJson
      ? {
          workflowFileName: parsed.data.workflowFileName,
          workflowJson: parsed.data.workflowJson
        }
      : undefined;

    const decoded = decodeDataUrl(parsed.data.dataUrl);
    if (!decoded || decoded.mimeType !== parsed.data.mimeType) {
      return c.json({ ok: false, error: "Pinned image payload is not a valid data URL" }, 400);
    }

    const contentHash = computeContentHash(decoded.bytes);
    const existing = await findPinnedImageByHash(clientId, contentHash);
    if (existing) {
      await registerPinnedImageBackup(existing.fileName, clientId, existing.sizeBytes, existing.contentHash, consumerKey, workflowMetadata);
      return c.json({
        ok: true,
        imageUrl: `/api/pinned-images/${encodeURIComponent(existing.fileName)}`,
        mimeType: parsed.data.mimeType
      });
    }

    const usage = await getTrackedPinnedStorageUsageBytes(clientId);
    const totalCapacityBytes = await getEffectivePinnedImagesCapacityBytes();
    if (usage.allUsersUsedBytes + decoded.bytes.byteLength > totalCapacityBytes) {
      return c.json({ ok: false, error: "Pinned image storage is full" }, 507);
    }

    const extension = mimeTypeToExtension(parsed.data.mimeType);
    const fileName = `${clientId}__${parsed.data.jobId}-${parsed.data.outputIndex}-${randomUUID()}.${extension}`;
    const filePath = join(PINNED_IMAGES_DIR, fileName);

    await mkdir(PINNED_IMAGES_DIR, { recursive: true });
    await writeFile(filePath, decoded.bytes);
    await registerPinnedImageBackup(fileName, clientId, decoded.bytes.byteLength, contentHash, consumerKey, workflowMetadata);

    return c.json({
      ok: true,
      imageUrl: `/api/pinned-images/${encodeURIComponent(fileName)}`,
      mimeType: parsed.data.mimeType
    });
  });

  app.use("/api/pinned-images/release", requireInvitedSession);
  app.post("/api/pinned-images/release", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = releasePinnedImageRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid pinned image release request" }, 400);
    }

    const clientId = getRequestClientId(c.req.raw, parsed.data.clientId ?? null);
    const consumerKey = buildPinnedImageConsumerKey(clientId, parsed.data.jobId, parsed.data.outputIndex);
    const fileName = parsePinnedImageFileNameFromUrl(parsed.data.imageUrl);
    if (!fileName) {
      return c.json({ ok: false, error: "Invalid pinned image url" }, 400);
    }

    const filePath = resolve(PINNED_IMAGES_DIR, fileName);
    if (!filePath.startsWith(PINNED_IMAGES_DIR)) {
      return c.json({ ok: false, error: "Invalid pinned image id" }, 400);
    }

    const releaseResult = await releasePinnedImageReference(fileName, clientId, consumerKey);
    if (releaseResult.shouldDeleteFile) {
      await unlink(filePath).catch((error) => {
        logServerWarning("Failed to delete released pinned image file", error, {
          fileName,
          clientId
        });
      });
    }

    return c.json({ ok: true, deleted: releaseResult.shouldDeleteFile });
  });

  app.use("/api/pinned-images/reconcile", requireInvitedSession);
  app.post("/api/pinned-images/reconcile", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = reconcilePinnedImagesRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid pinned image reconcile request" }, 400);
    }

    const clientId = getRequestClientId(c.req.raw, parsed.data.clientId ?? null);
    const refs = parsed.data.refs
      .map((ref) => {
        const fileName = parsePinnedImageFileNameFromUrl(ref.imageUrl);
        if (!fileName) {
          return null;
        }

        return {
          fileName,
          consumerKey: buildPinnedImageConsumerKey(clientId, ref.jobId, ref.outputIndex)
        };
      })
      .filter((ref): ref is { fileName: string; consumerKey: string } => Boolean(ref));

    let backfilledEntries = 0;
    const ensuredFiles = new Set<string>();

    for (const ref of refs) {
      const key = `${clientId}:${ref.fileName}`;
      if (ensuredFiles.has(key)) {
        continue;
      }
      ensuredFiles.add(key);

      const existing = await findPinnedImageByFileName(clientId, ref.fileName);
      if (existing) {
        continue;
      }

      const filePath = resolve(PINNED_IMAGES_DIR, ref.fileName);
      if (!filePath.startsWith(PINNED_IMAGES_DIR)) {
        continue;
      }

      const bytes = await readFile(filePath).catch((error) => {
        logServerWarning("Failed to read pinned image during reconcile backfill", error, {
          fileName: ref.fileName,
          clientId
        });
        return null;
      });
      if (!bytes) {
        continue;
      }

      const contentHash = computeContentHash(Uint8Array.from(bytes));
      await registerPinnedImageBackup(ref.fileName, clientId, bytes.byteLength, contentHash, ref.consumerKey);
      backfilledEntries += 1;
    }

    for (const ref of refs) {
      const existing = await findPinnedImageByFileName(clientId, ref.fileName);
      if (!existing) {
        continue;
      }

      await registerPinnedImageBackup(ref.fileName, clientId, existing.sizeBytes, existing.contentHash, ref.consumerKey);
    }

    const reconcileResult = await reconcilePinnedImageConsumersForClient(clientId, refs);
    await Promise.all(
      reconcileResult.filesToDelete.map(async (fileName) => {
        const filePath = resolve(PINNED_IMAGES_DIR, fileName);
        if (!filePath.startsWith(PINNED_IMAGES_DIR)) {
          return;
        }

        await unlink(filePath).catch((error) => {
          logServerWarning("Failed to delete reconciled stale pinned image file", error, {
            fileName,
            clientId
          });
        });
      })
    );

    return c.json({
      ok: true,
      reconciledEntries: reconcileResult.reconciledEntries,
      deletedFiles: reconcileResult.filesToDelete.length,
      backfilledEntries
    });
  });

  app.use("/api/pinned-images/clients", requireAdminSession);
  app.get("/api/pinned-images/clients", async (c) => {
    const clients = await listPinnedImageClientUsage();
    return c.json({
      ok: true,
      clients
    });
  });

  app.use("/api/pinned-images/prune", requireAdminSession);
  app.post("/api/pinned-images/prune", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = prunePinnedImagesRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid pinned image prune request" }, 400);
    }

    const pruneResult = await prunePinnedImagesToClients(parsed.data.keepClientIds);
    await Promise.all(
      pruneResult.filesToDelete.map(async (fileName) => {
        const filePath = resolve(PINNED_IMAGES_DIR, fileName);
        if (!filePath.startsWith(PINNED_IMAGES_DIR)) {
          return;
        }

        await unlink(filePath).catch((error) => {
          logServerWarning("Failed to delete pruned pinned image file", error, {
            fileName
          });
        });
      })
    );

    return c.json({
      ok: true,
      removedEntries: pruneResult.removedEntries,
      removedClients: pruneResult.removedClients,
      deletedFiles: pruneResult.filesToDelete.length,
      keptEntries: pruneResult.keptEntries,
      orphanedFilesDeleted: pruneResult.orphanedFilesDeleted
    });
  });

  app.use("/api/pinned-images/prune-preview", requireAdminSession);
  app.post("/api/pinned-images/prune-preview", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = prunePinnedImagesRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid pinned image prune preview request" }, 400);
    }

    const preview = await previewPrunePinnedImagesToClients(parsed.data.keepClientIds);
    return c.json({
      ok: true,
      keptEntries: preview.keptEntries,
      keptBytes: preview.keptBytes,
      keptClients: preview.keptClients,
      removedEntries: preview.removedEntries,
      removedBytes: preview.removedBytes,
      removedClients: preview.removedClients,
      orphanedFiles: preview.orphanedFiles,
      orphanedBytes: preview.orphanedBytes
    });
  });

  app.use("/api/pinned-images/archive", requireInvitedSession);
  app.get("/api/pinned-images/archive", async (c) => {
    return c.json({ ok: false, error: "Use POST /api/pinned-images/archive" }, 405);
  });

  app.post("/api/pinned-images/archive", async (c) => {
    const requestClientId = getRequestClientId(c.req.raw, null);
    const requestedClientId = c.req.query("clientId") ? sanitizeClientId(c.req.query("clientId")) : null;
    const isAdmin = await hasAdminSession(c);
    const payload = await c.req.json().catch(() => null);
    const transientPinnedItems = parseTransientPinnedArchiveItems(payload);
    const transientWorkflowsByJobId = parseTransientPinnedWorkflows(payload);
    const archivedPinnedFileNames = parseArchivedPinnedFileNames(payload);

    if (!isAdmin && requestedClientId && requestedClientId !== requestClientId) {
      return c.json({ ok: false, error: "Forbidden" }, 403);
    }

    const targetClientId = isAdmin && requestedClientId ? requestedClientId : requestClientId;
    const entries = await listPinnedImageEntriesForClient(targetClientId);

    const zipFile = new yazl.ZipFile();
    const missingFiles: string[] = [];
    const existingEntriesForHeal: Array<{ fileName: string; consumers: string[] }> = [];
    const workflowArchiveFiles = new Set<string>();
    const workflowArchiveKeys = new Set<string>();
    let zippedEntries = 0;

    for (const entry of entries) {
      const shouldFilterByPinnedState = targetClientId === requestClientId && archivedPinnedFileNames !== null;
      if (shouldFilterByPinnedState && !archivedPinnedFileNames.has(entry.fileName)) {
        continue;
      }

      const filePath = resolve(PINNED_IMAGES_DIR, entry.fileName);
      if (!filePath.startsWith(PINNED_IMAGES_DIR)) {
        missingFiles.push(entry.fileName);
        continue;
      }

      try {
        await readFile(filePath);
      } catch {
        missingFiles.push(entry.fileName);
        continue;
      }

      zipFile.addFile(filePath, entry.fileName);
      zippedEntries += 1;
      existingEntriesForHeal.push({ fileName: entry.fileName, consumers: entry.consumers });

      const workflowArchivePayload = buildWorkflowArchivePayload(entry);
      if (workflowArchivePayload && entry.consumers.length > 0) {
        const consumer = parseConsumerKey(entry.consumers[0] ?? "");
        const workflowKey = computeWorkflowPayloadKey(consumer?.jobId ?? "job", workflowArchivePayload);
        if (workflowArchiveKeys.has(workflowKey)) {
          continue;
        }

        workflowArchiveKeys.add(workflowKey);
        const workflowBase = sanitizeArchiveFileNamePart(entry.workflowFileName, "workflow");
        const workflowFileName = consumer
          ? `workflows/${sanitizeArchiveFileNamePart(targetClientId, "client")}-${consumer.jobId}-${workflowBase}.json`
          : `workflows/${sanitizeArchiveFileNamePart(targetClientId, "client")}-${workflowBase}.json`;

        if (!workflowArchiveFiles.has(workflowFileName)) {
          workflowArchiveFiles.add(workflowFileName);
          zipFile.addBuffer(Buffer.from(`${JSON.stringify(workflowArchivePayload, null, 2)}\n`, "utf8"), workflowFileName);
        }
      }
    }

    if (missingFiles.length > 0) {
      await selfHealPinnedManifestForClient(targetClientId, existingEntriesForHeal);
    }

    if (targetClientId === requestClientId && transientPinnedItems.length > 0) {
      for (const transientItem of transientPinnedItems) {
        const decoded = decodeDataUrl(transientItem.dataUrl);
        if (!decoded || decoded.mimeType !== transientItem.mimeType) {
          continue;
        }

        const fileBase = `${sanitizeArchiveFileNamePart(targetClientId, "client")}-${sanitizeArchiveFileNamePart(transientItem.jobId, "job")}-${transientItem.outputIndex}`;
        const extension = mimeTypeToExtension(transientItem.mimeType);
        const archiveImagePath = `cached/${fileBase}.${extension}`;
        zipFile.addBuffer(Buffer.from(decoded.bytes), archiveImagePath);

        const workflowMetadata = transientItem.workflowTemplateFileName
          ? transientWorkflowsByJobId.get(transientItem.workflowTemplateFileName)
          : undefined;
        const workflowArchivePayload = buildWorkflowArchivePayload({
          workflowTemplate: workflowMetadata?.workflowTemplate,
          workflowInputs: transientItem.workflowInputs,
          workflowJson: transientItem.workflowJson ?? workflowMetadata?.workflowJson
        });
        if (!workflowArchivePayload) {
          continue;
        }

        const workflowKey = computeWorkflowPayloadKey(transientItem.jobId, workflowArchivePayload);
        if (workflowArchiveKeys.has(workflowKey)) {
          continue;
        }
        workflowArchiveKeys.add(workflowKey);

        const workflowBase = sanitizeArchiveFileNamePart(transientItem.workflowTemplateFileName ?? workflowMetadata?.workflowFileName, "workflow");
        const workflowFileName = `workflows/${sanitizeArchiveFileNamePart(targetClientId, "client")}-${sanitizeArchiveFileNamePart(transientItem.jobId, "job")}-${workflowBase}.json`;
        if (workflowArchiveFiles.has(workflowFileName)) {
          continue;
        }

        workflowArchiveFiles.add(workflowFileName);
        zipFile.addBuffer(Buffer.from(`${JSON.stringify(workflowArchivePayload, null, 2)}\n`, "utf8"), workflowFileName);
      }
    }

    const metadata = {
      exportedAt: new Date().toISOString(),
      clientId: targetClientId,
      trackedEntries: entries.length,
      zippedEntries,
      missingTrackedFiles: missingFiles,
      entries
    };
    zipFile.addBuffer(Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, "utf8"), "manifest.export.json");
    zipFile.end();

    const fileName = `Chara2IMG-export-${formatArchiveTimestamp()}-${targetClientId}.zip`;
    const zipOutputStream = zipFile.outputStream as unknown as Readable;
    const responseBody = Readable.toWeb(zipOutputStream) as unknown as BodyInit;

    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=\"${fileName}\"`,
        "Cache-Control": "no-store"
      }
    });
  });

  app.use("/api/pinned-images/archive-batch", requireInvitedSession);
  app.post("/api/pinned-images/archive-batch", async (c) => {
    const isAdmin = await hasAdminSession(c);
    if (!isAdmin) {
      logServerWarning("Pinned archive batch denied: admin session required", new Error("Forbidden"), {
        path: "/api/pinned-images/archive-batch"
      });
      return c.json({ ok: false, error: "Forbidden" }, 403);
    }

    const payload = await c.req.json().catch(() => null) as {
      clientIds?: unknown;
      transientClientId?: unknown;
      transientPinnedItems?: unknown;
    } | null;
    const rawClientIds = Array.isArray(payload?.clientIds) ? payload?.clientIds : [];
    const clientIds = [...new Set(rawClientIds.filter((value): value is string => typeof value === "string").map((value) => sanitizeClientId(value)))];
    const transientClientId = typeof payload?.transientClientId === "string" ? sanitizeClientId(payload.transientClientId) : null;
    const transientPinnedItems = parseTransientPinnedArchiveItems(payload);
    const transientWorkflowsByJobId = parseTransientPinnedWorkflows(payload);
    const archivedPinnedFileNames = parseArchivedPinnedFileNames(payload);

    if (clientIds.length === 0) {
      logServerWarning("Pinned archive batch rejected: empty clientIds", new Error("BadRequest"), {
        path: "/api/pinned-images/archive-batch",
        receivedCount: rawClientIds.length
      });
      return c.json({ ok: false, error: "Invalid archive batch request" }, 400);
    }

    const zipFile = new yazl.ZipFile();
    const missingFiles: Array<{ clientId: string; fileName: string }> = [];
    const existingEntriesByClient = new Map<string, Array<{ fileName: string; consumers: string[] }>>();
    const includedByClient = new Map<string, number>();
    const workflowArchiveFiles = new Set<string>();
    const workflowArchiveKeys = new Set<string>();

    for (const clientId of clientIds) {
      const entries = await listPinnedImageEntriesForClient(clientId);
      for (const entry of entries) {
        const shouldFilterByPinnedState = transientClientId === clientId && archivedPinnedFileNames !== null;
        if (shouldFilterByPinnedState && !archivedPinnedFileNames.has(entry.fileName)) {
          continue;
        }

        const filePath = resolve(PINNED_IMAGES_DIR, entry.fileName);
        if (!filePath.startsWith(PINNED_IMAGES_DIR)) {
          missingFiles.push({ clientId, fileName: entry.fileName });
          continue;
        }

        try {
          await readFile(filePath);
        } catch {
          missingFiles.push({ clientId, fileName: entry.fileName });
          continue;
        }

        zipFile.addFile(filePath, `${clientId}/${entry.fileName}`);
        includedByClient.set(clientId, (includedByClient.get(clientId) ?? 0) + 1);
        const currentEntries = existingEntriesByClient.get(clientId) ?? [];
        currentEntries.push({ fileName: entry.fileName, consumers: entry.consumers });
        existingEntriesByClient.set(clientId, currentEntries);

        const workflowArchivePayload = buildWorkflowArchivePayload(entry);
        if (workflowArchivePayload && entry.consumers.length > 0) {
          const consumer = parseConsumerKey(entry.consumers[0] ?? "");
          const workflowKey = computeWorkflowPayloadKey(consumer?.jobId ?? "job", workflowArchivePayload);
          if (workflowArchiveKeys.has(workflowKey)) {
            continue;
          }

          workflowArchiveKeys.add(workflowKey);
          const workflowBase = sanitizeArchiveFileNamePart(entry.workflowFileName, "workflow");
          const workflowFileName = consumer
            ? `${clientId}/workflows/${sanitizeArchiveFileNamePart(clientId, "client")}-${consumer.jobId}-${workflowBase}.json`
            : `${clientId}/workflows/${sanitizeArchiveFileNamePart(clientId, "client")}-${workflowBase}.json`;

          if (!workflowArchiveFiles.has(workflowFileName)) {
            workflowArchiveFiles.add(workflowFileName);
            zipFile.addBuffer(Buffer.from(`${JSON.stringify(workflowArchivePayload, null, 2)}\n`, "utf8"), workflowFileName);
          }
        }
      }

      if (transientClientId === clientId && transientPinnedItems.length > 0) {
        for (const transientItem of transientPinnedItems) {
          const decoded = decodeDataUrl(transientItem.dataUrl);
          if (!decoded || decoded.mimeType !== transientItem.mimeType) {
            continue;
          }

          const fileBase = `${sanitizeArchiveFileNamePart(clientId, "client")}-${sanitizeArchiveFileNamePart(transientItem.jobId, "job")}-${transientItem.outputIndex}`;
          const extension = mimeTypeToExtension(transientItem.mimeType);
          const archiveImagePath = `${clientId}/cached/${fileBase}.${extension}`;
          zipFile.addBuffer(Buffer.from(decoded.bytes), archiveImagePath);
          includedByClient.set(clientId, (includedByClient.get(clientId) ?? 0) + 1);

          const workflowMetadata = transientItem.workflowTemplateFileName
            ? transientWorkflowsByJobId.get(transientItem.workflowTemplateFileName)
            : undefined;
          const workflowArchivePayload = buildWorkflowArchivePayload({
            workflowTemplate: workflowMetadata?.workflowTemplate,
            workflowInputs: transientItem.workflowInputs,
            workflowJson: transientItem.workflowJson ?? workflowMetadata?.workflowJson
          });
          if (!workflowArchivePayload) {
            continue;
          }

          const workflowKey = computeWorkflowPayloadKey(transientItem.jobId, workflowArchivePayload);
          if (workflowArchiveKeys.has(workflowKey)) {
            continue;
          }
          workflowArchiveKeys.add(workflowKey);

          const workflowBase = sanitizeArchiveFileNamePart(transientItem.workflowTemplateFileName ?? workflowMetadata?.workflowFileName, "workflow");
          const workflowFileName = `${clientId}/workflows/${sanitizeArchiveFileNamePart(clientId, "client")}-${sanitizeArchiveFileNamePart(transientItem.jobId, "job")}-${workflowBase}.json`;
          if (workflowArchiveFiles.has(workflowFileName)) {
            continue;
          }

          workflowArchiveFiles.add(workflowFileName);
          zipFile.addBuffer(Buffer.from(`${JSON.stringify(workflowArchivePayload, null, 2)}\n`, "utf8"), workflowFileName);
        }
      }
    }

    if (missingFiles.length > 0) {
      for (const [clientId, existingEntries] of existingEntriesByClient.entries()) {
        await selfHealPinnedManifestForClient(clientId, existingEntries);
      }
    }

    const metadata = {
      exportedAt: new Date().toISOString(),
      clientIds,
      includedByClient: Object.fromEntries(includedByClient.entries()),
      missingFiles
    };
    zipFile.addBuffer(Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, "utf8"), "manifest.export.json");
    zipFile.end();

    const zipOutputStream = zipFile.outputStream as unknown as Readable;
    const responseBody = Readable.toWeb(zipOutputStream) as unknown as BodyInit;

    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=\"Chara2IMG-export-${formatArchiveTimestamp()}-${clientIds.length}.zip\"`,
        "Cache-Control": "no-store"
      }
    });
  });

  app.use("/api/pinned-images/:fileName", requireInvitedSession);
  app.get("/api/pinned-images/:fileName", async (c) => {
    const rawFileName = c.req.param("fileName");
    const fileName = decodeURIComponent(rawFileName);

    if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) {
      return c.json({ ok: false, error: "Invalid image id" }, 400);
    }

    const filePath = resolve(PINNED_IMAGES_DIR, fileName);
    if (!filePath.startsWith(PINNED_IMAGES_DIR)) {
      return c.json({ ok: false, error: "Invalid image id" }, 400);
    }

    const extension = fileName.split(".").pop()?.toLowerCase();
    const mimeType = extension === "jpg" || extension === "jpeg"
      ? "image/jpeg"
      : extension === "webp"
        ? "image/webp"
        : extension === "gif"
          ? "image/gif"
          : "image/png";

    try {
      const bytes = await readFile(filePath);
      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": "private, max-age=31536000, immutable"
        }
      });
    } catch {
      return c.json({ ok: false, error: "Pinned image not found" }, 404);
    }
  });
}
