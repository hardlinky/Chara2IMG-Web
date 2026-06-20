import type { RecentJobRecord } from "../../shared/contracts/jobs";
import { isActiveRunpodStatus, isTerminalRunpodStatus, normalizeRunpodStatus, toTerminalReason } from "../../shared/contracts/jobs";
import { runViaProxy, type RunpodRunResponse } from "./api/runpodProxyClient";
import type { DynamicInputDraftValues } from "../../shared/contracts/inputs";

export type RunSubmissionSnapshot = {
  templateFingerprint: string;
  workflowFileName?: string;
  draftValues: DynamicInputDraftValues;
  submittedInput: Record<string, unknown>;
};

export type RunSubmissionDependencies = {
  submitRun?: typeof runViaProxy;
};

function toPlainObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function extractJobId(response: RunpodRunResponse): string {
  const directId = response.id ?? response.jobId;
  if (typeof directId === "string" && directId.trim()) {
    return directId;
  }

  const nestedData = toPlainObject(response.data);
  const nestedId = nestedData?.id ?? nestedData?.jobId;
  if (typeof nestedId === "string" && nestedId.trim()) {
    return nestedId;
  }

  throw new Error("Run submission response did not include a job id.");
}

function extractStatus(response: RunpodRunResponse): string {
  const directStatus = response.status;
  if (typeof directStatus === "string" && directStatus.trim()) {
    return directStatus;
  }

  const nestedData = toPlainObject(response.data);
  const nestedStatus = nestedData?.status;
  return typeof nestedStatus === "string" && nestedStatus.trim() ? nestedStatus : "IN_QUEUE";
}

function buildLifecycleSnapshot(status: string): RecentJobRecord["lifecycle"] {
  const normalizedStatus = normalizeRunpodStatus(status);
  const terminal = isTerminalRunpodStatus(normalizedStatus);
  return {
    status: normalizedStatus,
    isTerminal: terminal,
    terminalReason: terminal ? toTerminalReason(normalizedStatus) : undefined,
    lastCheckedAt: new Date().toISOString(),
    finishedAt: terminal ? new Date().toISOString() : undefined,
    warning: null,
    executionTimeMs: undefined,
    failureReason: null
  };
}

export async function submitRunAndPersistRecentJob(args: {
  endpointId: string;
  apiKey: string;
  submittedInput: Record<string, unknown>;
  snapshot: RunSubmissionSnapshot;
  dependencies?: RunSubmissionDependencies;
}): Promise<RunpodRunResponse> {
  const submitRun = args.dependencies?.submitRun ?? runViaProxy;

  const response = await submitRun({
    endpointId: args.endpointId,
    apiKey: args.apiKey,
    input: args.submittedInput
  });

  return response;
}

export function getTerminalStatusLabel(status: string): string {
  if (isTerminalRunpodStatus(status)) {
    return status;
  }

  if (isActiveRunpodStatus(status)) {
    return status;
  }

  return "UNKNOWN";
}