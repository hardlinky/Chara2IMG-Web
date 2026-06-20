import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Hono } from "hono";
import { requireInvitedSession } from "../middleware/session";
import { listJobs, readJob, deleteJob, getJobTmpDir } from "../lib/jobStore";

export function registerJobsRoutes(app: Hono): void {
  app.use("/api/jobs/*", requireInvitedSession);

  app.get("/api/jobs", async (c) => {
    const jobs = await listJobs();
    return c.json({ ok: true, jobs });
  });

  app.get("/api/jobs/:jobId", async (c) => {
    const jobId = c.req.param("jobId");
    const job = await readJob(jobId);
    if (job === null) {
      return c.json({ ok: false, error: "Not found" }, 404);
    }
    return c.json({ ok: true, job });
  });

  app.get("/api/jobs/:jobId/inputs", async (c) => {
    const jobId = c.req.param("jobId");
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

  app.delete("/api/jobs/:jobId", async (c) => {
    const jobId = c.req.param("jobId");
    await deleteJob(jobId);
    return c.json({ ok: true });
  });
}
