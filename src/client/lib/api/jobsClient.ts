import type { JobRecord, RecentJobRecord } from "../../../shared/contracts/jobs";

export function adaptJobRecord(job: JobRecord): RecentJobRecord {
  return {
    jobId: job.jobId,
    endpointId: job.endpointId,
    submittedAt: job.submittedAt,
    hiddenAt: null,
    pinnedAt: null,
    lifecycle: {
      status: job.status,
      isTerminal: job.isTerminal,
      terminalReason: job.terminalReason,
      lastCheckedAt: undefined,
      finishedAt: job.completedAt ?? undefined,
      warning: null,
      executionTimeMs: undefined,
      failureReason: job.lastError ?? null,
    },
    provenance: {
      templateFingerprint: "",
      workflowFileName: job.workflowFileName ?? undefined,
      draftValues: {},
      submittedInput: {},
    },
    lastResponse: null,
    outputImageCount: job.imageCount,
    lastError: job.lastError,
    hiddenOutputIndices: job.deletedImageIndices ?? [],
    outputsHidden: false,
    pinnedOutputIndices: job.pinnedImageIndices,
    imageUnarchiveExpiries: job.imageUnarchiveExpiries,
  };
}

export async function listJobs(): Promise<RecentJobRecord[]> {
  const res = await fetch("/api/jobs");
  if (!res.ok) throw new Error(`Failed to list jobs: ${res.status}`);
  const data = (await res.json()) as { ok: boolean; jobs: JobRecord[] };
  return data.jobs.map(adaptJobRecord);
}

export async function getJob(jobId: string): Promise<RecentJobRecord | null> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to get job ${jobId}: ${res.status}`);
  const data = (await res.json()) as { ok: boolean; job: JobRecord };
  return adaptJobRecord(data.job);
}

export async function deleteJob(jobId: string): Promise<void> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete job ${jobId}: ${res.status}`);
}

/**
 * Fetch the saved inputs for a job (the ComfyUI workflow JSON that was submitted).
 * Returns null if the job or its inputs are no longer available (404).
 */
export async function getJobInputs(jobId: string): Promise<{ submittedInput: Record<string, unknown> } | null> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/inputs`, { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch inputs for job ${jobId}: ${res.status}`);
  const data = (await res.json()) as { ok: boolean; inputs: { submittedInput: Record<string, unknown> } };
  return data.inputs ?? null;
}

/**
 * Pin a single image output. Moves server file from tmp → archive.
 * Returns {ok: true} on success.
 */
export async function deleteImage(jobId: string, imageIndex: number): Promise<void> {
  const res = await fetch(
    `/api/jobs/${encodeURIComponent(jobId)}/images/${imageIndex}`,
    { method: "DELETE", credentials: "include" }
  );
  if (!res.ok) throw new Error(`Failed to delete image ${jobId}/${imageIndex}: ${res.status}`);
}

export async function pinImage(jobId: string, imageIndex: number): Promise<{ ok: boolean }> {
  const res = await fetch(
    `/api/jobs/${encodeURIComponent(jobId)}/images/${imageIndex}/pin`,
    { method: "POST", credentials: "include" }
  );
  if (!res.ok) return { ok: false };
  return (await res.json()) as { ok: boolean };
}

/**
 * Unpin a single image output. Moves server file from archive → tmp with 1-hour TTL.
 * Returns {ok, unarchiveExpiresAt} on success.
 */
export async function unpinImage(
  jobId: string,
  imageIndex: number
): Promise<{ ok: true; unarchiveExpiresAt: string } | { ok: false }> {
  const res = await fetch(
    `/api/jobs/${encodeURIComponent(jobId)}/images/${imageIndex}/unpin`,
    { method: "POST", credentials: "include" }
  );
  if (!res.ok) return { ok: false };
  return (await res.json()) as { ok: true; unarchiveExpiresAt: string } | { ok: false };
}
