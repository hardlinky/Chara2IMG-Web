import { writeFile } from "node:fs/promises";
import { forwardRunpodRequest } from "./runpodClient";
import { readJob, updateJob, getJobImagePath } from "./jobStore";
import {
  isTerminalRunpodStatus,
  normalizeRunpodStatus,
  toTerminalReason,
  type JobStatus,
  JOB_IMAGE_TTL_MS,
} from "../../shared/contracts/jobs.js";
import { extractRunpodOutputImages } from "../../shared/outputImage";
import { logServerError, logServerWarning } from "./logger";

// ─── Internal types ───────────────────────────────────────────────────────────

type TrackedJob = {
  endpointId: string;
  jobId: string;
  apiKey: string;
  nextPollAt: number;
};

type PollResult =
  | { ok: true; statusCode: number; data: unknown }
  | { ok: false; statusCode?: number; error: string; data?: unknown };

// ─── State ────────────────────────────────────────────────────────────────────

const trackedJobs = new Map<string, TrackedJob>();
const POLL_INTERVAL_MS = Math.max(
  1_000,
  Number(process.env.RUNPOD_TRACKER_POLL_INTERVAL_MS ?? 10_000),
);
let trackerTimer: NodeJS.Timeout | null = null;
let trackerTickRunning = false;

function toKey(endpointId: string, jobId: string): string {
  return `${endpointId}:${jobId}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJsonOrRaw(body: string): unknown {
  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    logServerWarning("Job tracker received non-JSON response", error, {
      bodyPreview: body.slice(0, 200),
    });
    return { raw: body };
  }
}

function mimeTypeToExt(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}

// ─── Image writing ────────────────────────────────────────────────────────────

async function writeJobImages(jobId: string, data: unknown): Promise<void> {
  let images: ReturnType<typeof extractRunpodOutputImages>;
  try {
    images = extractRunpodOutputImages(data);
  } catch (error) {
    logServerError("Failed to extract output images", error, { jobId });
    return;
  }

  if (images.length === 0) {
    return;
  }

  const record = await readJob(jobId);
  const displayName = record?.displayName ?? jobId;

  let written = 0;
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    if (!image) continue;

    const ext = mimeTypeToExt(image.mimeType);
    const fileName = `${displayName}-${index}.${ext}`;
    const filePath = getJobImagePath(jobId, fileName, false);

    try {
      // Strip the data URL prefix to get raw base64
      const base64Match = /^data:[^;]+;base64,(.+)$/.exec(image.dataUrl.trim());
      if (!base64Match || !base64Match[1]) {
        logServerWarning("Skipping image with invalid data URL", null, { jobId, index });
        continue;
      }

      const buffer = Buffer.from(base64Match[1], "base64");
      await writeFile(filePath, buffer);
      written += 1;
    } catch (error) {
      logServerError("Failed to write job image", error, { jobId, fileName });
    }
  }

  if (written > 0) {
    await updateJob(jobId, { imageCount: written });
  }
}

// ─── Timer ────────────────────────────────────────────────────────────────────

function ensureTrackerRunning(): void {
  if (trackerTimer) {
    return;
  }

  trackerTimer = setInterval(() => {
    void runTrackerTick();
  }, POLL_INTERVAL_MS);
}

// ─── Poll ─────────────────────────────────────────────────────────────────────

async function pollTrackedJob(job: TrackedJob): Promise<PollResult> {
  try {
    const existing = await readJob(job.jobId);

    const response = await forwardRunpodRequest({
      endpointId: job.endpointId,
      apiKey: job.apiKey,
      operation: "status",
      id: job.jobId,
    });

    const text = await response.text();
    const data = parseJsonOrRaw(text);

    if (!response.ok) {
      if (response.status === 404) {
        await updateJob(job.jobId, {
          status: "TIMED_OUT" as JobStatus,
          isTerminal: true,
          terminalReason: "expired-or-not-found",
        });
        trackedJobs.delete(toKey(job.endpointId, job.jobId));
      }

      return {
        ok: false,
        statusCode: response.status,
        error: `RunPod status request failed (${response.status})`,
        data,
      };
    }

    const rawStatus =
      data !== null && typeof data === "object" && "status" in data
        ? String((data as Record<string, unknown>)["status"] ?? "")
        : "";

    const status = normalizeRunpodStatus(rawStatus) as JobStatus;
    const isTerminal = isTerminalRunpodStatus(rawStatus);
    const terminalReason = toTerminalReason(rawStatus);
    const completedAt =
      isTerminal && status === "COMPLETED" ? new Date().toISOString() : undefined;
    const expiresAt =
      completedAt !== undefined
        ? new Date(Date.now() + JOB_IMAGE_TTL_MS).toISOString()
        : undefined;

    const jobUpdates: Parameters<typeof updateJob>[1] = { status, isTerminal };
    if (terminalReason !== undefined) {
      jobUpdates.terminalReason = terminalReason;
    }

    if (completedAt !== undefined) {
      jobUpdates.completedAt = completedAt;
    }

    if (expiresAt !== undefined) {
      jobUpdates.expiresAt = expiresAt;
    }

    await updateJob(job.jobId, jobUpdates);

    // Write images only when status first becomes COMPLETED
    if (isTerminal && status === "COMPLETED" && !existing?.isTerminal) {
      await writeJobImages(job.jobId, data);
    }

    if (isTerminal) {
      trackedJobs.delete(toKey(job.endpointId, job.jobId));
    }

    return { ok: true, statusCode: response.status, data };
  } catch (error) {
    logServerError("Job tracker poll failed", error, {
      endpointId: job.endpointId,
      jobId: job.jobId,
    });

    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runTrackerTick(): Promise<void> {
  if (trackerTickRunning) {
    return;
  }

  trackerTickRunning = true;
  try {
    const now = Date.now();
    const dueJobs = [...trackedJobs.values()].filter((job) => job.nextPollAt <= now);

    for (const job of dueJobs) {
      const key = toKey(job.endpointId, job.jobId);
      const latest = trackedJobs.get(key);
      if (!latest) {
        continue;
      }

      latest.nextPollAt = Date.now() + POLL_INTERVAL_MS;
      const result = await pollTrackedJob(latest);
      if (!result.ok && result.statusCode !== 404) {
        latest.nextPollAt = Date.now() + POLL_INTERVAL_MS * 2;
      }
    }
  } finally {
    trackerTickRunning = false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function trackJob(
  endpointId: string,
  jobId: string,
  apiKey: string,
): Promise<void> {
  const key = toKey(endpointId, jobId);
  const existing = await readJob(jobId);

  if (existing?.isTerminal) {
    trackedJobs.delete(key);
    return;
  }

  trackedJobs.set(key, {
    endpointId,
    jobId,
    apiKey,
    nextPollAt: Date.now(),
  });

  ensureTrackerRunning();
}

export async function pollJobNow(
  endpointId: string,
  jobId: string,
  apiKey: string,
): Promise<PollResult> {
  await trackJob(endpointId, jobId, apiKey);

  const tracked = trackedJobs.get(toKey(endpointId, jobId));
  if (!tracked) {
    // Job is terminal — return from store
    const record = await readJob(jobId);
    if (record) {
      return { ok: true, statusCode: 200, data: record };
    }

    return { ok: false, error: "Job not found" };
  }

  tracked.nextPollAt = Date.now() + POLL_INTERVAL_MS;
  return pollTrackedJob(tracked);
}
