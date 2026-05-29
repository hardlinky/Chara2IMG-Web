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

    const decoded = decodeDataUrl(parsed.data.dataUrl);
    if (!decoded || decoded.mimeType !== parsed.data.mimeType) {
      return c.json({ ok: false, error: "Pinned image payload is not a valid data URL" }, 400);
    }

    const contentHash = computeContentHash(decoded.bytes);
    const existing = await findPinnedImageByHash(clientId, contentHash);
    if (existing) {
      await registerPinnedImageBackup(existing.fileName, clientId, existing.sizeBytes, existing.contentHash, consumerKey);
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
    await registerPinnedImageBackup(fileName, clientId, decoded.bytes.byteLength, contentHash, consumerKey);

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
    const requestClientId = getRequestClientId(c.req.raw, null);
    const requestedClientId = c.req.query("clientId") ? sanitizeClientId(c.req.query("clientId")) : null;
    const isAdmin = await hasAdminSession(c);

    if (!isAdmin && requestedClientId && requestedClientId !== requestClientId) {
      return c.json({ ok: false, error: "Forbidden" }, 403);
    }

    const targetClientId = isAdmin && requestedClientId ? requestedClientId : requestClientId;
    const entries = await listPinnedImageEntriesForClient(targetClientId);

    const zipFile = new yazl.ZipFile();
    const missingFiles: string[] = [];
    let zippedEntries = 0;

    for (const entry of entries) {
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

    const fileName = `${targetClientId}-pinned-images.zip`;
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
