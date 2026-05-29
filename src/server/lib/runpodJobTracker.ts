import { forwardRunpodRequest } from "./runpodClient";
import { getCachedRunpodJobState, setCachedRunpodJobState } from "./runpodJobStateStore";

type TrackedRunpodJob = {
  endpointId: string;
  jobId: string;
  apiKey: string;
  nextPollAt: number;
};

type PollRunpodJobResult =
  | {
      ok: true;
      statusCode: number;
      data: unknown;
    }
  | {
      ok: false;
      statusCode?: number;
      error: string;
      data?: unknown;
    };

const trackedJobs = new Map<string, TrackedRunpodJob>();
const RUNPOD_TRACKER_POLL_INTERVAL_MS = Math.max(1_000, Number(process.env.RUNPOD_TRACKER_POLL_INTERVAL_MS ?? 10_000));
let trackerTimer: NodeJS.Timeout | null = null;
let trackerTickRunning = false;

function toTrackedJobKey(endpointId: string, jobId: string): string {
  return `${endpointId}:${jobId}`;
}

function parseJsonOrRaw(body: string): unknown {
  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body);
  } catch {
    return { raw: body };
  }
}

function ensureTrackerRunning(): void {
  if (trackerTimer) {
    return;
  }

  trackerTimer = setInterval(() => {
    void runTrackerTick();
  }, RUNPOD_TRACKER_POLL_INTERVAL_MS);
}

async function pollTrackedJob(job: TrackedRunpodJob): Promise<PollRunpodJobResult> {
  try {
    const response = await forwardRunpodRequest({
      endpointId: job.endpointId,
      apiKey: job.apiKey,
      operation: "status",
      id: job.jobId
    });

    const text = await response.text();
    const data = parseJsonOrRaw(text);

    if (!response.ok) {
      if (response.status === 404) {
        const notFoundData = {
          id: job.jobId,
          status: "TIMED_OUT",
          error: "Runpod status returned 404",
          reason: "expired-or-not-found"
        };
        setCachedRunpodJobState(job.endpointId, job.jobId, notFoundData);
        trackedJobs.delete(toTrackedJobKey(job.endpointId, job.jobId));
      }

      return {
        ok: false,
        statusCode: response.status,
        error: `Runpod status request failed (${response.status})`,
        data
      };
    }

    const next = setCachedRunpodJobState(job.endpointId, job.jobId, data);
    if (next.isTerminal) {
      trackedJobs.delete(toTrackedJobKey(job.endpointId, job.jobId));
    }

    return {
      ok: true,
      statusCode: response.status,
      data
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
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
      const key = toTrackedJobKey(job.endpointId, job.jobId);
      const latest = trackedJobs.get(key);
      if (!latest) {
        continue;
      }

      latest.nextPollAt = Date.now() + RUNPOD_TRACKER_POLL_INTERVAL_MS;
      const result = await pollTrackedJob(latest);
      if (!result.ok && result.statusCode !== 404) {
        latest.nextPollAt = Date.now() + RUNPOD_TRACKER_POLL_INTERVAL_MS * 2;
      }
    }
  } finally {
    trackerTickRunning = false;
  }
}

export function trackRunpodJob(endpointId: string, jobId: string, apiKey: string): void {
  const key = toTrackedJobKey(endpointId, jobId);
  const cached = getCachedRunpodJobState(endpointId, jobId);
  if (cached?.isTerminal) {
    trackedJobs.delete(key);
    return;
  }

  trackedJobs.set(key, {
    endpointId,
    jobId,
    apiKey,
    nextPollAt: Date.now()
  });

  ensureTrackerRunning();
}

export async function pollRunpodJobNow(endpointId: string, jobId: string, apiKey: string): Promise<PollRunpodJobResult> {
  trackRunpodJob(endpointId, jobId, apiKey);
  const tracked = trackedJobs.get(toTrackedJobKey(endpointId, jobId));
  if (!tracked) {
    const cached = getCachedRunpodJobState(endpointId, jobId);
    if (cached) {
      return {
        ok: true,
        statusCode: 200,
        data: cached.data
      };
    }

    return {
      ok: false,
      error: "Job is not tracked"
    };
  }

  tracked.nextPollAt = Date.now() + RUNPOD_TRACKER_POLL_INTERVAL_MS;
  return pollTrackedJob(tracked);
}
