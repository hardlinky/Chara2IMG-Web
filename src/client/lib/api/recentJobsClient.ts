import type { RecentJobRecord, RecentJobSubmissionInput } from "../../../shared/contracts/jobs";
import { ProxyRequestError } from "./runpodProxyClient";
import {
  clearRecentJobs as clearLegacyRecentJobs,
  deleteRecentJob as deleteLegacyRecentJob,
  estimateRecentJobsStoredBytes as estimateLegacyRecentJobsStoredBytes,
  getRecentJob as getLegacyRecentJob,
  hideJobOutputs as hideLegacyJobOutputs,
  hideRecentJob as hideLegacyRecentJob,
  listRecentJobs as listLegacyRecentJobs,
  listVisibleRecentJobs as listLegacyVisibleRecentJobs,
  pruneRecentJobs as pruneLegacyRecentJobs,
  removeRecentJobOutputImage as removeLegacyRecentJobOutputImage,
  setRecentJobOutputPinned as setLegacyRecentJobOutputPinned,
  startRecentJobsImageCompactionMigration as startLegacyRecentJobsImageCompactionMigration,
  toggleRecentJobOutputPinned as toggleLegacyRecentJobOutputPinned,
  updateRecentJobLifecycle as updateLegacyRecentJobLifecycle,
  upsertRecentJob as upsertLegacyRecentJob
} from "../recentJobsStorage";

const SERVER_STORAGE_MIGRATION_FLAG = "chara2imgRecentJobsMigratedToServer";
let migrationPromise: Promise<void> | null = null;

async function callRecentJobsApi<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(path, {
      credentials: "include",
      ...init
    });

    const data = (await response.json().catch(() => null)) as T | { ok?: boolean; error?: string } | null;
    if (!response.ok || !data || typeof data !== "object" || ("ok" in data && (data as { ok?: unknown }).ok === false)) {
      return null;
    }

    return data as T;
  } catch {
    return null;
  }
}

async function migrateLegacyRecentJobsIfNeeded(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  if (window.localStorage.getItem(SERVER_STORAGE_MIGRATION_FLAG) === "true") {
    return;
  }

  const legacyJobs = await listLegacyRecentJobs();
  if (legacyJobs.length === 0) {
    window.localStorage.setItem(SERVER_STORAGE_MIGRATION_FLAG, "true");
    return;
  }

  const remoteJobs = await callRecentJobsApi<{ ok: true; jobs: RecentJobRecord[] }>("/api/recent-jobs");
  if (!remoteJobs) {
    return;
  }

  for (const job of legacyJobs) {
    await callRecentJobsApi<{ ok: true; job: RecentJobRecord }>("/api/recent-jobs/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job)
    });
  }

  await clearLegacyRecentJobs();
  window.localStorage.setItem(SERVER_STORAGE_MIGRATION_FLAG, "true");
}

async function ensureLegacyJobsAreMigrated(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  if (window.localStorage.getItem(SERVER_STORAGE_MIGRATION_FLAG) === "true") {
    return;
  }

  if (!migrationPromise) {
    migrationPromise = migrateLegacyRecentJobsIfNeeded().finally(() => {
      migrationPromise = null;
    });
  }

  await migrationPromise;
}

export async function startRecentJobsImageCompactionMigration(batchSize: number = 5): Promise<void> {
  const remote = await callRecentJobsApi<{ ok: true }>("/api/recent-jobs/compaction-migration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ batchSize })
  });

  if (remote) {
    return;
  }

  await startLegacyRecentJobsImageCompactionMigration(batchSize);
}

export async function upsertRecentJob(input: RecentJobSubmissionInput): Promise<RecentJobRecord> {
  const remote = await callRecentJobsApi<{ ok: true; job: RecentJobRecord }>("/api/recent-jobs/upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  if (remote) {
    await migrateLegacyRecentJobsIfNeeded();
    return remote.job;
  }

  return upsertLegacyRecentJob(input);
}

export async function getRecentJob(jobId: string): Promise<RecentJobRecord | null> {
  await ensureLegacyJobsAreMigrated();
  const remote = await callRecentJobsApi<{ ok: true; job: RecentJobRecord }>(`/api/recent-jobs/${encodeURIComponent(jobId)}`);
  if (remote) {
    return remote.job;
  }

  return getLegacyRecentJob(jobId);
}

export async function listRecentJobs(): Promise<RecentJobRecord[]> {
  await ensureLegacyJobsAreMigrated();
  const remote = await callRecentJobsApi<{ ok: true; jobs: RecentJobRecord[] }>("/api/recent-jobs");
  if (remote) {
    return remote.jobs;
  }

  return listLegacyRecentJobs();
}

export async function listVisibleRecentJobs(): Promise<RecentJobRecord[]> {
  await ensureLegacyJobsAreMigrated();
  const remote = await callRecentJobsApi<{ ok: true; jobs: RecentJobRecord[] }>("/api/recent-jobs?visible=true");
  if (remote) {
    return remote.jobs;
  }

  return listLegacyVisibleRecentJobs();
}

export async function hideRecentJob(jobId: string, hiddenAt: string = new Date().toISOString()): Promise<void> {
  const remote = await callRecentJobsApi<{ ok: true }>(`/api/recent-jobs/${encodeURIComponent(jobId)}/hide`, {
    method: "POST"
  });

  if (remote) {
    return;
  }

  await hideLegacyRecentJob(jobId, hiddenAt);
}

export async function deleteRecentJob(jobId: string): Promise<void> {
  const remote = await callRecentJobsApi<{ ok: true }>(`/api/recent-jobs/${encodeURIComponent(jobId)}`, {
    method: "DELETE"
  });

  if (remote) {
    return;
  }

  await deleteLegacyRecentJob(jobId);
}

export async function setRecentJobOutputPinned(
  jobId: string,
  outputIndex: number,
  pinned: boolean,
  pinnedAt: string = new Date().toISOString(),
  replacementDataUrl?: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const remote = await callRecentJobsApi<{ ok: true } | { ok: false; reason: string }>(`/api/recent-jobs/${encodeURIComponent(jobId)}/pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outputIndex, pinned, pinnedAt, replacementDataUrl })
  });

  if (remote) {
    return remote;
  }

  return setLegacyRecentJobOutputPinned(jobId, outputIndex, pinned, pinnedAt, replacementDataUrl);
}

export async function toggleRecentJobOutputPinned(jobId: string, outputIndex: number, pinned: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
  const remote = await callRecentJobsApi<{ ok: true } | { ok: false; reason: string }>(`/api/recent-jobs/${encodeURIComponent(jobId)}/toggle-pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outputIndex, pinned })
  });

  if (remote) {
    return remote;
  }

  return toggleLegacyRecentJobOutputPinned(jobId, outputIndex, pinned);
}

export async function removeRecentJobOutputImage(jobId: string, outputIndex: number): Promise<void> {
  const remote = await callRecentJobsApi<{ ok: true }>(`/api/recent-jobs/${encodeURIComponent(jobId)}/remove-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outputIndex })
  });

  if (remote) {
    return;
  }

  await removeLegacyRecentJobOutputImage(jobId, outputIndex);
}

export async function hideJobOutputs(jobId: string): Promise<void> {
  const remote = await callRecentJobsApi<{ ok: true }>(`/api/recent-jobs/${encodeURIComponent(jobId)}/hide-outputs`, {
    method: "POST"
  });

  if (remote) {
    return;
  }

  await hideLegacyJobOutputs(jobId);
}

export async function pruneRecentJobs(now: number = Date.now()): Promise<void> {
  const remote = await callRecentJobsApi<{ ok: true }>("/api/recent-jobs/prune", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ now })
  });

  if (remote) {
    return;
  }

  await pruneLegacyRecentJobs(now);
}

export async function clearRecentJobs(): Promise<void> {
  const remote = await callRecentJobsApi<{ ok: true }>("/api/recent-jobs", {
    method: "DELETE"
  });

  if (remote) {
    return;
  }

  await clearLegacyRecentJobs();
}

export async function estimateRecentJobsStoredBytes(): Promise<number> {
  await ensureLegacyJobsAreMigrated();
  const remote = await callRecentJobsApi<{ ok: true; bytes: number }>("/api/recent-jobs/estimate");
  if (remote) {
    return remote.bytes;
  }

  return estimateLegacyRecentJobsStoredBytes();
}

export async function updateRecentJobLifecycle(
  jobId: string,
  lifecycle: RecentJobRecord["lifecycle"],
  lastResponse: RecentJobRecord["lastResponse"] = null,
  lastError: RecentJobRecord["lastError"] = null
): Promise<void> {
  const remote = await callRecentJobsApi<{ ok: true }>("/api/recent-jobs/update-lifecycle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, lifecycle, lastResponse, lastError })
  });

  if (remote) {
    return;
  }

  await updateLegacyRecentJobLifecycle(jobId, lifecycle, lastResponse, lastError);
}
