import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Hono } from "hono";
import { getSessionUser, requireInvitedSession } from "../middleware/session";
import { listJobs, readJob, readJobAnywhere, deleteJob, deleteJobImage, getJobTmpDir, getJobArchiveDir, pinImage, unpinImage, listPresentImageIndices } from "../lib/jobStore";
import { isImageInVisibleAlbum, removeImageFromAllAlbums } from "../lib/albumStore";
import type { JobRecord } from "../../shared/contracts/jobs";

// A user can see their own jobs plus anonymous (null-owner) ones.
function canSeeJob(job: Pick<JobRecord, "createdBy">, user: string | null): boolean {
  return (job.createdBy ?? null) === null || job.createdBy === user;
}

export function registerJobsRoutes(app: Hono): void {
  app.use("/api/jobs/*", requireInvitedSession);
  app.use("/api/jobs", requireInvitedSession);

  app.get("/api/jobs", async (c) => {
    const user = await getSessionUser(c);
    const jobs = (await listJobs()).filter((job) => canSeeJob(job, user));
    return c.json({ ok: true, jobs });
  });

  app.get("/api/jobs/:jobId", async (c) => {
    const jobId = c.req.param("jobId");
    const user = await getSessionUser(c);
    const job = await readJob(jobId);
    if (job === null || !canSeeJob(job, user)) {
      return c.json({ ok: false, error: "Not found" }, 404);
    }
    const availableImageIndices = await listPresentImageIndices(jobId, job.displayName);
    return c.json({ ok: true, job: { ...job, availableImageIndices } });
  });

  app.get("/api/jobs/:jobId/inputs", async (c) => {
    const jobId = c.req.param("jobId");
    const user = await getSessionUser(c);
    const job = await readJobAnywhere(jobId);
    if (!job || !canSeeJob(job, user)) {
      return c.json({ ok: false, error: "Not found" }, 404);
    }
    const inputsPath = join(getJobTmpDir(), "jobs", jobId, "inputs.json");
    try {
      const raw = await readFile(inputsPath, "utf8");
      const parsed = JSON.parse(raw);
      return c.json({ ok: true, inputs: parsed });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return c.json({ ok: false, error: "Not found" }, 404);
      }
      throw err;
    }
  });

  app.get("/api/jobs/:jobId/images/:index", async (c) => {
    const jobId = c.req.param("jobId");
    const indexStr = c.req.param("index");
    const index = parseInt(indexStr, 10);
    if (!Number.isFinite(index) || index < 0) {
      return c.json({ ok: false, error: "Invalid index" }, 400);
    }

    const job = await readJobAnywhere(jobId);
    if (!job) {
      return c.json({ ok: false, error: "Not found" }, 404);
    }

    // Owners/anonymous see their images directly; otherwise mirror album
    // visibility so anonymous and published album images can still render.
    const user = await getSessionUser(c);
    if (!canSeeJob(job, user) && !(await isImageInVisibleAlbum(jobId, index, user))) {
      return c.json({ ok: false, error: "Not found" }, 404);
    }

    // Pinned images live in archive dir; all others in tmp
    const isPinned = job.pinnedImageIndices?.includes(index) ?? false;
    const base = join(isPinned ? getJobArchiveDir() : getJobTmpDir(), "jobs", jobId);
    const candidates = [
      { ext: "png", mime: "image/png" },
      { ext: "jpg", mime: "image/jpeg" },
      { ext: "webp", mime: "image/webp" },
    ] as const;

    for (const { ext, mime } of candidates) {
      const filePath = join(base, `${job.displayName}-${index}.${ext}`);
      try {
        const data = await readFile(filePath);
        return new Response(data, {
          headers: {
            "Content-Type": mime,
            "Content-Disposition": `attachment; filename="${job.displayName}-${index}.${ext}"`,
            "Cache-Control": "private, max-age=3600",
          },
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        // try next extension
      }
    }

    return c.json({ ok: false, error: "Not found" }, 404);
  });

  app.post("/api/jobs/:jobId/images/:index/pin", async (c) => {
    const jobId = c.req.param("jobId");
    const index = parseInt(c.req.param("index"), 10);
    if (!Number.isFinite(index) || index < 0) {
      return c.json({ ok: false, error: "Invalid index" }, 400);
    }

    const user = await getSessionUser(c);
    const job = await readJobAnywhere(jobId);
    if (!job || !canSeeJob(job, user)) {
      return c.json({ ok: false, error: "Not found" }, 404);
    }

    const success = await pinImage(jobId, index);
    if (!success) {
      return c.json({ ok: false, error: "Not found" }, 404);
    }
    return c.json({ ok: true });
  });

  app.post("/api/jobs/:jobId/images/:index/unpin", async (c) => {
    const jobId = c.req.param("jobId");
    const index = parseInt(c.req.param("index"), 10);
    if (!Number.isFinite(index) || index < 0) {
      return c.json({ ok: false, error: "Invalid index" }, 400);
    }

    const user = await getSessionUser(c);
    const job = await readJobAnywhere(jobId);
    if (!job || !canSeeJob(job, user)) {
      return c.json({ ok: false, error: "Not found" }, 404);
    }

    const result = await unpinImage(jobId, index);
    if (!result.ok) {
      return c.json({ ok: false, error: "Not found" }, 404);
    }
    return c.json({ ok: true, unarchiveExpiresAt: result.unarchiveExpiresAt });
  });

  app.delete("/api/jobs/:jobId/images/:index", async (c) => {
    const jobId = c.req.param("jobId");
    const index = parseInt(c.req.param("index"), 10);
    if (!Number.isFinite(index) || index < 0) {
      return c.json({ ok: false, error: "Invalid index" }, 400);
    }
    const user = await getSessionUser(c);
    const job = await readJobAnywhere(jobId);
    if (!job || !canSeeJob(job, user)) {
      return c.json({ ok: false, error: "Not found" }, 404);
    }
    await deleteJobImage(jobId, index);
    await removeImageFromAllAlbums(jobId, index);
    return c.json({ ok: true });
  });

  app.delete("/api/jobs/:jobId", async (c) => {
    const jobId = c.req.param("jobId");
    const user = await getSessionUser(c);
    const job = await readJobAnywhere(jobId);
    if (!job || !canSeeJob(job, user)) {
      return c.json({ ok: false, error: "Not found" }, 404);
    }
    await deleteJob(jobId);
    return c.json({ ok: true });
  });
}
