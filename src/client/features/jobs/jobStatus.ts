import {
  RUNPOD_JOB_STATUSES,
  isActiveRunpodStatus,
  isTerminalRunpodStatus,
  normalizeRunpodStatus,
  toTerminalReason,
  type RecentJobRecord,
  type RecentJobSubmissionInput,
  type RunpodJobStatus
} from "../../../shared/contracts/jobs";

export const JOB_POLL_INTERVAL_MS = 5000;
export const JOB_OBSERVATION_TIMEOUT_MS = Number.POSITIVE_INFINITY;

export function getJobAgeMs(submittedAt: string, now: number = Date.now()): number {
  return Math.max(0, now - Date.parse(submittedAt));
}

export function hasJobObservationTimedOut(job: Pick<RecentJobRecord, "submittedAt" | "lifecycle">, now: number = Date.now()): boolean {
  void job;
  void now;
  return false;
}

export function isCancellableJobStatus(status: string): boolean {
  return isActiveRunpodStatus(status);
}

export function isTerminalJobSnapshot(job: Pick<RecentJobRecord, "lifecycle">): boolean {
  return job.lifecycle.isTerminal || isTerminalRunpodStatus(job.lifecycle.status);
}

export function buildLifecycleSnapshotFromStatus(
  status: string,
  now: string = new Date().toISOString(),
  executionTimeMs?: number
): RecentJobRecord["lifecycle"] {
  const normalizedStatus = normalizeRunpodStatus(status);
  const terminal = isTerminalRunpodStatus(normalizedStatus);

  return {
    status: normalizedStatus,
    isTerminal: terminal,
    terminalReason: terminal ? toTerminalReason(normalizedStatus) : undefined,
    lastCheckedAt: now,
    finishedAt: terminal ? now : undefined,
    warning: null,
    executionTimeMs,
    failureReason: null
  };
}

export function buildTerminalLifecycleSnapshot(args: {
  status: string;
  terminalReason: RecentJobRecord["lifecycle"]["terminalReason"];
  finishedAt?: string;
  failureReason?: string | null;
}): RecentJobRecord["lifecycle"] {
  const finishedAt = args.finishedAt ?? new Date().toISOString();
  return {
    status: args.status,
    isTerminal: true,
    terminalReason: args.terminalReason,
    lastCheckedAt: finishedAt,
    finishedAt,
    warning: null,
    executionTimeMs: undefined,
    failureReason: args.failureReason ?? null
  };
}

export function classifyTimeoutLifecycle(job: RecentJobRecord, now: number = Date.now()): RecentJobRecord["lifecycle"] | null {
  void job;
  void now;
  return null;
}

export function classifyKnownJob404Lifecycle(job: RecentJobRecord, now: number = Date.now()): RecentJobRecord["lifecycle"] {
  const finishedAt = new Date(now).toISOString();
  return {
    status: job.lifecycle.status,
    isTerminal: true,
    terminalReason: "expired-or-not-found",
    lastCheckedAt: finishedAt,
    finishedAt,
    warning: null,
    executionTimeMs: undefined,
    failureReason: "Runpod status returned 404"
  };
}

export function formatSubmittedAtRelative(submittedAt: string, now: number = Date.now()): string {
  const deltaMs = Math.max(0, now - Date.parse(submittedAt));
  const minutes = Math.floor(deltaMs / 60000);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ago`;
  }

  if (minutes > 0) {
    return `${minutes}m ago`;
  }

  return "just now";
}

export function normalizeActiveStatus(status: string): RunpodJobStatus | string {
  const normalizedStatus = normalizeRunpodStatus(status);

  if (RUNPOD_JOB_STATUSES.includes(normalizedStatus as RunpodJobStatus)) {
    return normalizedStatus;
  }

  return normalizedStatus;
}
