import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";
import { requireInvitedSession } from "../middleware/session";
import { backupPinnedImageRequestSchema } from "../schemas/pinnedImages";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(CURRENT_DIR, "../../..");
const PINNED_IMAGES_DIR = resolve(PROJECT_ROOT, ".data", "pinned-images");

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
  app.use("/api/pinned-images/*", requireInvitedSession);

  app.post("/api/pinned-images/backup", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = backupPinnedImageRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid pinned image backup request" }, 400);
    }

    const decoded = decodeDataUrl(parsed.data.dataUrl);
    if (!decoded || decoded.mimeType !== parsed.data.mimeType) {
      return c.json({ ok: false, error: "Pinned image payload is not a valid data URL" }, 400);
    }

    const extension = mimeTypeToExtension(parsed.data.mimeType);
    const fileName = `${parsed.data.jobId}-${parsed.data.outputIndex}-${randomUUID()}.${extension}`;
    const filePath = join(PINNED_IMAGES_DIR, fileName);

    await mkdir(PINNED_IMAGES_DIR, { recursive: true });
    await writeFile(filePath, decoded.bytes);

    return c.json({
      ok: true,
      imageUrl: `/api/pinned-images/${encodeURIComponent(fileName)}`,
      mimeType: parsed.data.mimeType
    });
  });

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
