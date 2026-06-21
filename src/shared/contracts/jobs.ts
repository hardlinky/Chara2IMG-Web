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
  startedAt?: string;
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
  cacheExpiresAt?: number; // epoch ms; set only for server URL-based images (not embedded dataUrls)
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
  imageUnarchiveExpiries?: Record<string, string | null>; // mirrors JobRecord field; used by client projection
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

// ─── New persistence model (Phase 02+) ───────────────────────────────────────

// Default base directories (overridable via env vars in server code).
// Stored here so shared contracts document the layout convention.
export const JOBS_TMP_DIR_DEFAULT = "../chara2img/jobs-tmp";
export const JOBS_ARCHIVE_DIR_DEFAULT = "../chara2img/archive";
export const JOB_IMAGE_TTL_MS = 60 * 60 * 1000; // 1 hour in ms

export type JobStatus = RunpodJobStatus | "PENDING" | "UNKNOWN";

export type JobInputs = {
  draftValues: DynamicInputDraftValues;
  submittedInput: Record<string, unknown>;
};

// Core job record — written to {jobDir}/job.json, updated on each poll.
// workflowFileName references {tmpDir}/workflows/{workflowFileName}.json
// (same key in archiveDir if job is archived).
// displayName = FNV-1a hash of jobId (8 hex chars) — use this for all UI display.
// jobId is internal; never show it in the UI.
export type JobRecord = {
  jobId: string;
  displayName: string;
  endpointId: string;
  workflowFileName: string | null;
  submittedAt: string;
  startedAt?: string | null;                              // when the job first became IN_PROGRESS
  completedAt: string | null;
  expiresAt: string | null;
  status: JobStatus;
  isTerminal: boolean;
  terminalReason?: JobTerminalReason;
  imageCount: number;
  lastError: string | null;
  isArchived?: boolean;
  pinnedImageIndices?: number[];                          // indices of per-image pinned outputs
  deletedImageIndices?: number[];                        // indices permanently deleted via delete-image API
  imageUnarchiveExpiries?: Record<string, string | null>; // key=imageIndex.toString(), value=ISO expiry or null
};

// Per-image record stored inside JobManifestEntry and server manifest.
// relPath is relative to either tmpDir or archiveDir (see isArchived).
// Full path = {tmpDir}/{relPath} if !isArchived, {archiveDir}/{relPath} if isArchived.
// fileName format: {displayName}-{imageIndex}.{ext}  e.g. "a3f2c1b0-0.png"
export type JobImageRecord = {
  jobId: string;
  imageIndex: number;
  fileName: string;
  relPath: string;
  mimeType: JobOutputImageMimeType;
  sizeBytes: number;
  isPinned: boolean;
  isArchived: boolean;
  archivedAt: string | null;
  unarchiveExpiresAt: string | null;
};

// Entry in the server-side manifest.
export type JobManifestEntry = {
  jobId: string;
  displayName: string;
  endpointId: string;
  workflowFileName: string | null;
  submittedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  status: JobStatus;
  isTerminal: boolean;
  imageCount: number;
  images: JobImageRecord[];
};

// Per-image state on the client (no relPath — client uses API endpoint).
export type ClientImageState = {
  imageIndex: number;
  fileName: string;
  isPinned: boolean;
  isArchived: boolean;
  clientCachedUntil: string | null;
};

// Entry in the client-side lightweight manifest.
export type ClientManifestEntry = {
  jobId: string;
  displayName: string;
  endpointId: string;
  workflowFileName: string | null;
  submittedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  status: JobStatus;
  isTerminal: boolean;
  imageCount: number;
  images: ClientImageState[];
};

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