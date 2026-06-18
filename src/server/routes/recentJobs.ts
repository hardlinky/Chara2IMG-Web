import type { Hono } from "hono";
import { requireInvitedSession } from "../middleware/session";
import {
  clearRecentJobs,
  deleteRecentJob,
  estimateRecentJobsStoredBytes,
  getRecentJob,
  hideJobOutputs,
  hideRecentJob,
  listRecentJobs,
  listVisibleRecentJobs,
  pruneRecentJobs,
  removeRecentJobOutputImage,
  setRecentJobOutputPinned,
  startRecentJobsImageCompactionMigration,
  toggleRecentJobOutputPinned,
  updateRecentJobLifecycle,
  upsertRecentJob
} from "../lib/recentJobsStore";

export function registerRecentJobsRoutes(app: Hono): void {
  app.use("/api/recent-jobs/*", requireInvitedSession);

  app.get("/api/recent-jobs", async (c) => {
    const visible = c.req.query("visible") === "true";
    const jobs = visible ? await listVisibleRecentJobs() : await listRecentJobs();
    return c.json({ ok: true, jobs });
  });

  app.get("/api/recent-jobs/:jobId", async (c) => {
    const job = await getRecentJob(c.req.param("jobId"));
    if (!job) {
      return c.json({ ok: false, error: "Job not found" }, 404);
    }

    return c.json({ ok: true, job });
  });

  app.post("/api/recent-jobs/upsert", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const job = await upsertRecentJob(payload);
    return c.json({ ok: true, job });
  });

  app.post("/api/recent-jobs/update-lifecycle", async (c) => {
    const payload = await c.req.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return c.json({ ok: false, error: "Invalid request" }, 400);
    }

    await updateRecentJobLifecycle(
      (payload as { jobId?: string }).jobId ?? "",
      (payload as { lifecycle?: unknown }).lifecycle as never,
      (payload as { lastResponse?: unknown }).lastResponse as never,
      (payload as { lastError?: unknown }).lastError as never
    );

    return c.json({ ok: true });
  });

  app.post("/api/recent-jobs/:jobId/hide", async (c) => {
    await hideRecentJob(c.req.param("jobId"), new Date().toISOString());
    return c.json({ ok: true });
  });

  app.delete("/api/recent-jobs/:jobId", async (c) => {
    await deleteRecentJob(c.req.param("jobId"));
    return c.json({ ok: true });
  });

  app.post("/api/recent-jobs/:jobId/remove-image", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const outputIndex = Number((payload as { outputIndex?: unknown } | null)?.outputIndex);
    await removeRecentJobOutputImage(c.req.param("jobId"), outputIndex);
    return c.json({ ok: true });
  });

  app.post("/api/recent-jobs/:jobId/hide-outputs", async (c) => {
    await hideJobOutputs(c.req.param("jobId"));
    return c.json({ ok: true });
  });

  app.post("/api/recent-jobs/:jobId/pin", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const outputIndex = Number((payload as { outputIndex?: unknown } | null)?.outputIndex);
    const pinned = Boolean((payload as { pinned?: unknown } | null)?.pinned);
    const result = await setRecentJobOutputPinned(c.req.param("jobId"), outputIndex, pinned);
    return c.json(result, result.ok ? 200 : 400);
  });

  app.post("/api/recent-jobs/:jobId/toggle-pin", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const outputIndex = Number((payload as { outputIndex?: unknown } | null)?.outputIndex);
    const pinned = Boolean((payload as { pinned?: unknown } | null)?.pinned);
    const result = await toggleRecentJobOutputPinned(c.req.param("jobId"), outputIndex, pinned);
    return c.json(result, result.ok ? 200 : 400);
  });

  app.post("/api/recent-jobs/prune", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const now = Number((payload as { now?: unknown } | null)?.now ?? Date.now());
    await pruneRecentJobs(Number.isFinite(now) ? now : Date.now());
    return c.json({ ok: true });
  });

  app.delete("/api/recent-jobs", async (c) => {
    await clearRecentJobs();
    return c.json({ ok: true });
  });

  app.get("/api/recent-jobs/estimate", async (c) => {
    const bytes = await estimateRecentJobsStoredBytes();
    return c.json({ ok: true, bytes });
  });

  app.post("/api/recent-jobs/compaction-migration", async (c) => {
    await startRecentJobsImageCompactionMigration();
    return c.json({ ok: true });
  });
}
