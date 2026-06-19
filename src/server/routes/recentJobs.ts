import { stat } from "node:fs/promises";
import type { Hono } from "hono";
import { requireInvitedSession } from "../middleware/session";
import { createJob, readJob, updateJob, deleteJob, listJobs, archiveJob, purgeExpiredJobs, getJobTmpDir } from "../lib/jobStore";
import { formatJobDisplayName } from "../../shared/jobDisplay";
import { type JobRecord, type JobInputs, JOB_IMAGE_TTL_MS, toTerminalReason, normalizeRunpodStatus, isTerminalRunpodStatus } from "../../shared/contracts/jobs";

export function registerRecentJobsRoutes(app: Hono): void {
  app.use("/api/recent-jobs/*", requireInvitedSession);

  app.get("/api/recent-jobs", async (c) => {
    const jobs = await listJobs();
    return c.json({ ok: true, jobs });
  });

  // Register specific GET paths before the :jobId wildcard
  app.get("/api/recent-jobs/estimate", async (c) => {
    try {
      const info = await stat(getJobTmpDir());
      return c.json({ ok: true, bytes: info.size });
    } catch {
      return c.json({ ok: true, bytes: 0 });
    }
  });

  app.post("/api/recent-jobs/upsert", async (c) => {
    const payload = await c.req.json().catch(() => null);
    if (!payload || typeof payload !== "object" || typeof (payload as { jobId?: unknown }).jobId !== "string") {
      return c.json({ ok: false, error: "Invalid job payload" }, 400);
    }

    const p = payload as {
      jobId: string;
      endpointId?: string;
      lifecycle?: { status?: string; isTerminal?: boolean };
      provenance?: { workflowFileName?: string; draftValues?: unknown; submittedInput?: unknown };
      submittedAt?: string;
      lastError?: string | null;
    };

    const jobId = p.jobId;
    const existing = await readJob(jobId);
    const status = normalizeRunpodStatus(p.lifecycle?.status ?? "IN_QUEUE");
    const isTerminal = p.lifecycle?.isTerminal ?? isTerminalRunpodStatus(status);
    const terminalReason = isTerminal ? toTerminalReason(status) : undefined;
    const now = new Date().toISOString();

    if (existing) {
      const job = await updateJob(jobId, {
        status: status as JobRecord["status"],
        isTerminal,
        terminalReason,
        lastError: p.lastError ?? existing.lastError,
        ...(isTerminal && !existing.completedAt
          ? {
              completedAt: now,
              expiresAt: new Date(Date.now() + JOB_IMAGE_TTL_MS).toISOString(),
            }
          : {}),
      });
      return c.json({ ok: true, job });
    }

    const record: JobRecord = {
      jobId,
      displayName: formatJobDisplayName(jobId),
      endpointId: p.endpointId ?? "",
      workflowFileName: p.provenance?.workflowFileName ?? null,
      submittedAt: p.submittedAt ?? now,
      completedAt: isTerminal ? now : null,
      expiresAt: isTerminal ? new Date(Date.now() + JOB_IMAGE_TTL_MS).toISOString() : null,
      status: status as JobRecord["status"],
      isTerminal,
      terminalReason,
      imageCount: 0,
      lastError: p.lastError ?? null,
    };

    const inputs: JobInputs = {
      draftValues: (p.provenance?.draftValues as JobInputs["draftValues"]) ?? {},
      submittedInput: (p.provenance?.submittedInput as Record<string, unknown>) ?? {},
    };

    await createJob(record, inputs);
    return c.json({ ok: true, job: record });
  });

  app.post("/api/recent-jobs/update-lifecycle", async (c) => {
    const payload = await c.req.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return c.json({ ok: false, error: "Invalid request" }, 400);
    }

    const p = payload as {
      jobId?: string;
      status?: string;
      isTerminal?: boolean;
      lastError?: string | null;
    };

    const jobId = p.jobId ?? "";
    const updates: Partial<JobRecord> = {};

    if (p.status !== undefined) {
      const normalized = normalizeRunpodStatus(p.status);
      updates.status = normalized as JobRecord["status"];
      updates.isTerminal = p.isTerminal ?? isTerminalRunpodStatus(normalized);
      updates.terminalReason = toTerminalReason(normalized);
    } else if (p.isTerminal !== undefined) {
      updates.isTerminal = p.isTerminal;
    }

    if (p.lastError !== undefined) {
      updates.lastError = p.lastError;
    }

    if (updates.isTerminal) {
      const now = new Date().toISOString();
      updates.completedAt = now;
      updates.expiresAt = new Date(Date.now() + JOB_IMAGE_TTL_MS).toISOString();
    }

    await updateJob(jobId, updates);
    return c.json({ ok: true });
  });

  app.post("/api/recent-jobs/prune", async (c) => {
    const deleted = await purgeExpiredJobs();
    return c.json({ ok: true, deleted });
  });

  app.delete("/api/recent-jobs", async (c) => {
    const jobs = await listJobs();
    await Promise.all(jobs.map((j) => deleteJob(j.jobId)));
    return c.json({ ok: true });
  });

  app.get("/api/recent-jobs/:jobId", async (c) => {
    const job = await readJob(c.req.param("jobId"));
    if (!job) {
      return c.json({ ok: false, error: "Job not found" }, 404);
    }
    return c.json({ ok: true, job });
  });

  app.post("/api/recent-jobs/:jobId/hide", async (c) => {
    return c.json({ ok: true });
  });

  app.delete("/api/recent-jobs/:jobId", async (c) => {
    await deleteJob(c.req.param("jobId"));
    return c.json({ ok: true });
  });

  app.post("/api/recent-jobs/:jobId/remove-image", async (c) => {
    return c.json({ ok: false, error: "not implemented" }, 501);
  });

  app.post("/api/recent-jobs/:jobId/hide-outputs", async (c) => {
    return c.json({ ok: true });
  });

  app.post("/api/recent-jobs/:jobId/pin", async (c) => {
    const archived = await archiveJob(c.req.param("jobId"));
    return c.json({ ok: archived });
  });

  app.post("/api/recent-jobs/:jobId/toggle-pin", async (c) => {
    const archived = await archiveJob(c.req.param("jobId"));
    return c.json({ ok: archived });
  });
}

