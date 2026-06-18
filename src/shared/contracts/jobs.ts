import type { DynamicInputDraftValues } from "./inputs";

export const RECENT_JOBS_VISIBLE_LIMIT = 25;
export const RECENT_JOBS_UNPINNED_LIMIT = 10;
export const RECENT_JOBS_PINNED_LIMIT = 10;
export const RECENT_JOBS_HIDDEN_RETENTION_MS = 24 * 60 * 60 * 1000;

export const RUNPOD_JOB_STATUSES = ["IN_QUEUE", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"] as const;

export type RunpodJobStatus = (typeof RUNPOD_JOB_STATUSES)[number];

export const JOB_TERMINAL_REASONS = [
  "completed",
  "failed",
  "cancelled",
  "timed-out",
  "expired-or-not-found",
  "run-submission-failed"
] as const;

export type JobTerminalReason = (typeof JOB_TERMINAL_REASONS)[number];

export type JobLifecycleSnapshot = {
  status: RunpodJobStatus | string;
  isTerminal: boolean;
  terminalReason?: JobTerminalReason;
  lastCheckedAt?: string;
  finishedAt?: string;
  warning?: string | null;
  executionTimeMs?: number;
  failureReason?: string | null;
};

export type RecentJobProvenance = {
  templateFingerprint: string;
  workflowFileName?: string;
  draftValues: DynamicInputDraftValues;
  submittedInput: Record<string, unknown>;
};

export type JobOutputImageMimeType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export type RecentJobOutputImage = {
  dataUrl: string;
  mimeType: JobOutputImageMimeType;
  sourcePath: string;
  outputIndex: number;
  isPinned: boolean;
};

export type RecentJobOutputCluster = {
  jobId: string;
  isPinned: boolean;
  endpointId: string;
  submittedAt: string;
  finishedAt: string | null;
  workflowFileName?: string;
  outputCount: number;
  representative: RecentJobOutputImage;
  outputs: RecentJobOutputImage[];
};

export type RecentJobRecord = {
  jobId: string;
  endpointId: string;
  submittedAt: string;
  hiddenAt: string | null;
  pinnedAt?: string | null;
  pinnedOutputIndices?: number[];
  lifecycle: JobLifecycleSnapshot;
  provenance: RecentJobProvenance;
  lastResponse: Record<string, unknown> | null;
  outputImageCount?: number;
  lastError: string | null;
  hiddenOutputIndices?: number[];
  outputsHidden?: boolean;
};

export type RecentJobSubmissionInput = {
  jobId: string;
  endpointId: string;
  templateFingerprint: string;
  workflowFileName?: string;
  draftValues: DynamicInputDraftValues;
  submittedInput: Record<string, unknown>;
  lifecycle: JobLifecycleSnapshot;
  lastResponse: Record<string, unknown> | null;
  lastError?: string | null;
  submittedAt?: string;
  pinnedAt?: string | null;
  pinnedOutputIndices?: number[];
};

// Backend poll snapshots can return legacy/vendor aliases; normalize them so
// client lifecycle/polling logic always uses canonical Runpod statuses.
const RUNPOD_STATUS_ALIASES: Readonly<Record<string, RunpodJobStatus>> = {
  QUEUED: "IN_QUEUE",
  PENDING: "IN_QUEUE",
  RUNNING: "IN_PROGRESS",
  PROCESSING: "IN_PROGRESS",
  CANCELED: "CANCELLED",
  TIMEOUT: "TIMED_OUT"
};

export function normalizeRunpodStatus(status: string): RunpodJobStatus | string {
  const normalized = status.trim().toUpperCase().replace(/\s+/g, "_");
  const canonical = RUNPOD_STATUS_ALIASES[normalized] ?? normalized;

  if (RUNPOD_JOB_STATUSES.includes(canonical as RunpodJobStatus)) {
    return canonical as RunpodJobStatus;
  }

  return canonical;
}

export function isTerminalRunpodStatus(status: string): boolean {
  const normalized = normalizeRunpodStatus(status);
  return normalized === "COMPLETED" || normalized === "FAILED" || normalized === "CANCELLED" || normalized === "TIMED_OUT";
}

export function isActiveRunpodStatus(status: string): boolean {
  const normalized = normalizeRunpodStatus(status);
  return normalized === "IN_QUEUE" || normalized === "IN_PROGRESS";
}

export function toTerminalReason(status: string): JobTerminalReason | undefined {
  switch (normalizeRunpodStatus(status)) {
    case "COMPLETED":
      return "completed";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "cancelled";
    case "TIMED_OUT":
      return "timed-out";
    default:
      return undefined;
  }
}