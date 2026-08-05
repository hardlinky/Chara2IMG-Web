import type { Hono } from "hono";
import { requireInvitedSession } from "../middleware/session";
import {
  addImageToAlbum,
  createAlbum,
  deleteAlbum,
  getAlbum,
  listAlbums,
  removeImageFromAlbum,
  updateAlbum
} from "../lib/albumStore";
import { addAlbumImageSchema, createAlbumSchema, updateAlbumSchema } from "../schemas/albums";

export function registerAlbumRoutes(app: Hono): void {
  app.use("/api/albums", requireInvitedSession);
  app.use("/api/albums/*", requireInvitedSession);

  app.get("/api/albums", async (c) => {
    const albums = await listAlbums();
    return c.json({ ok: true, albums });
  });

  app.post("/api/albums", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createAlbumSchema.safeParse(body);
    if (!parsed.success) return c.json({ ok: false, error: "Invalid request" }, 400);
    const album = await createAlbum(parsed.data);
    return c.json({ ok: true, album }, 201);
  });

  app.get("/api/albums/:id", async (c) => {
    const album = await getAlbum(c.req.param("id"));
    if (!album) return c.json({ ok: false, error: "Not found" }, 404);
    return c.json({ ok: true, album });
  });

  app.patch("/api/albums/:id", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = updateAlbumSchema.safeParse(body);
    if (!parsed.success) return c.json({ ok: false, error: "Invalid request" }, 400);
    const album = await updateAlbum(c.req.param("id"), parsed.data);
    if (!album) return c.json({ ok: false, error: "Not found" }, 404);
    return c.json({ ok: true, album });
  });

  app.delete("/api/albums/:id", async (c) => {
    const deleted = await deleteAlbum(c.req.param("id"));
    if (!deleted) return c.json({ ok: false, error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  app.post("/api/albums/:id/images", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = addAlbumImageSchema.safeParse(body);
    if (!parsed.success) return c.json({ ok: false, error: "Invalid request" }, 400);
    const album = await addImageToAlbum(c.req.param("id"), parsed.data.jobId, parsed.data.imageIndex);
    if (!album) return c.json({ ok: false, error: "Not found" }, 404);
    return c.json({ ok: true, album });
  });

  app.delete("/api/albums/:id/images/:jobId/:index", async (c) => {
    const index = Number.parseInt(c.req.param("index"), 10);
    if (!Number.isFinite(index) || index < 0) {
      return c.json({ ok: false, error: "Invalid index" }, 400);
    }
    // Returns null when the album is not found or was emptied and removed; both
    // are treated as success from the client's perspective.
    const album = await removeImageFromAlbum(c.req.param("id"), c.req.param("jobId"), index);
    return c.json({ ok: true, album: album ?? null });
  });
}
