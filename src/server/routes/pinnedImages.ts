import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { Hono } from "hono";
import { requireAdminSession, requireInvitedSession } from "../middleware/session";
import { archiveJob, getJobArchiveDir, listJobs, purgeExpiredJobs } from "../lib/jobStore";

function mimeTypeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".jpg": case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    default: return "image/png";
  }
}

export function registerPinnedImageRoutes(app: Hono): void {
  app.use("/api/pinned-images/*", requireInvitedSession);

  // Stats
  app.get("/api/pinned-images/stats", async (c) => {
    const jobs = await listJobs();
    const archived = jobs.filter(j => j.isArchived);
    return c.json({ ok: true, archivedJobCount: archived.length, totalBytes: 0 });
  });

  // List archived jobs
  app.get("/api/pinned-images/archive", async (c) => {
    const jobs = await listJobs();
    return c.json({ ok: true, jobs: jobs.filter(j => j.isArchived) });
  });

  // Archive a job by jobId
  app.post("/api/pinned-images/archive", requireAdminSession, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const jobId = typeof body?.jobId === "string" ? body.jobId : null;
    if (!jobId) return c.json({ ok: false, error: "jobId required" }, 400);
    const archived = await archiveJob(jobId);
    return c.json({ ok: archived, jobId });
  });

  // My entries — same as archive list
  app.get("/api/pinned-images/my-entries", async (c) => {
    const jobs = await listJobs();
    return c.json({ ok: true, jobs: jobs.filter(j => j.isArchived) });
  });

  // Prune expired jobs
  app.post("/api/pinned-images/prune", requireAdminSession, async (c) => {
    const deleted = await purgeExpiredJobs();
    return c.json({ ok: true, deleted });
  });

  // Archive batch — real feature, not yet implemented
  app.post("/api/pinned-images/archive-batch", (_c) => {
    return new Response(JSON.stringify({ ok: false, error: "not implemented" }), {
      status: 501,
      headers: { "Content-Type": "application/json" },
    });
  });

  // Serve a pinned image file by fileName
  app.get("/api/pinned-images/:fileName", async (c) => {
    const fileName = c.req.param("fileName");
    if (!fileName || /[/\\]/.test(fileName)) {
      return c.json({ ok: false, error: "Invalid file name" }, 400);
    }
    const archiveBase = getJobArchiveDir();
    const jobs = await listJobs();
    const archivedJobIds = jobs.filter(j => j.isArchived).map(j => j.jobId);
    for (const jobId of archivedJobIds) {
      const filePath = join(archiveBase, "jobs", jobId, fileName);
      try {
        const bytes = await readFile(filePath);
        return new Response(bytes, {
          status: 200,
          headers: { "Content-Type": mimeTypeFromExt(extname(fileName)) },
        });
      } catch { /* ENOENT — try next */ }
    }
    return c.json({ ok: false, error: "File not found" }, 404);
  });
}