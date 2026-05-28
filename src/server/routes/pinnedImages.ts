import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, stat, statfs, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";
import { requireInvitedSession } from "../middleware/session";
import { backupPinnedImageRequestSchema } from "../schemas/pinnedImages";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(CURRENT_DIR, "../../..");
const PINNED_IMAGES_DIR = (() => {
  const configured = process.env.PINNED_IMAGES_STORAGE_DIR?.trim();
  if (configured) {
    return resolve(PROJECT_ROOT, configured);
  }

  return resolve(tmpdir(), "chara2img", "pinned-images");
})();
const DEFAULT_PINNED_IMAGES_CAPACITY_BYTES = 10 * 1024 * 1024 * 1024;

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

async function getEffectivePinnedImagesCapacityBytes(): Promise<number> {
  const configured = getConfiguredPinnedImagesCapacityBytes();
  const diskCapacity = await getPinnedImagesDiskCapacityBytes();

  if (diskCapacity === null) {
    return configured;
  }

  return Math.max(1, Math.min(configured, diskCapacity));
}

function sanitizeClientId(value: string | null | undefined): string {
  if (!value) {
    return "anonymous";
  }

  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return normalized || "anonymous";
}

function getRequestClientId(request: Request, fallbackClientId?: string | null): string {
  if (fallbackClientId) {
    return sanitizeClientId(fallbackClientId);
  }

  const headerValue = request.headers.get("x-chara2img-client-id");
  return sanitizeClientId(headerValue);
}

async function collectPinnedStorageUsageBytes(clientId: string): Promise<{ userUsedBytes: number; allUsersUsedBytes: number }> {
  try {
    await mkdir(PINNED_IMAGES_DIR, { recursive: true });
  } catch {
    return {
      userUsedBytes: 0,
      allUsersUsedBytes: 0
    };
  }

  let fileNames: string[] = [];
  try {
    fileNames = await readdir(PINNED_IMAGES_DIR);
  } catch {
    return {
      userUsedBytes: 0,
      allUsersUsedBytes: 0
    };
  }

  let userUsedBytes = 0;
  let allUsersUsedBytes = 0;

  for (const fileName of fileNames) {
    const filePath = resolve(PINNED_IMAGES_DIR, fileName);
    if (!filePath.startsWith(PINNED_IMAGES_DIR)) {
      continue;
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        continue;
      }

      allUsersUsedBytes += fileStat.size;
      if (fileName.startsWith(`${clientId}-`)) {
        userUsedBytes += fileStat.size;
      }
    } catch {
      // Skip files that disappear mid-scan.
    }
  }

  return {
    userUsedBytes,
    allUsersUsedBytes
  };
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

export function registerPinnedImageRoutes(app: Hono): void {
  app.get("/api/pinned-images/stats", async (c) => {
    const clientId = getRequestClientId(c.req.raw, c.req.query("clientId"));
    const usage = await collectPinnedStorageUsageBytes(clientId);
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

    const decoded = decodeDataUrl(parsed.data.dataUrl);
    if (!decoded || decoded.mimeType !== parsed.data.mimeType) {
      return c.json({ ok: false, error: "Pinned image payload is not a valid data URL" }, 400);
    }

    const usage = await collectPinnedStorageUsageBytes(clientId);
    const totalCapacityBytes = await getEffectivePinnedImagesCapacityBytes();
    if (usage.allUsersUsedBytes + decoded.bytes.byteLength > totalCapacityBytes) {
      return c.json({ ok: false, error: "Pinned image storage is full" }, 507);
    }

    const extension = mimeTypeToExtension(parsed.data.mimeType);
    const fileName = `${clientId}-${parsed.data.jobId}-${parsed.data.outputIndex}-${randomUUID()}.${extension}`;
    const filePath = join(PINNED_IMAGES_DIR, fileName);

    await mkdir(PINNED_IMAGES_DIR, { recursive: true });
    await writeFile(filePath, decoded.bytes);

    return c.json({
      ok: true,
      imageUrl: `/api/pinned-images/${encodeURIComponent(fileName)}`,
      mimeType: parsed.data.mimeType
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
