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
    hiddenOutputIndices: [],
    outputsHidden: false,
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
