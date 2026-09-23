export type RunpodJobSettings = {
  useWebhook: boolean;
  // 0 means "use whatever the endpoint is configured with".
  executionTimeoutSeconds: number;
};

export const EXECUTION_TIMEOUT_STEP_SECONDS = 60;
// Matches RunPod's per-job policy bounds (5 seconds to 7 days).
export const MIN_EXECUTION_TIMEOUT_SECONDS = 60;
export const MAX_EXECUTION_TIMEOUT_SECONDS = 7 * 24 * 60 * 60;

export const DEFAULT_RUNPOD_JOB_SETTINGS: RunpodJobSettings = {
  useWebhook: false,
  executionTimeoutSeconds: 0
};

export function normalizeExecutionTimeoutSeconds(value: unknown): number {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }

  const stepped = Math.round(seconds / EXECUTION_TIMEOUT_STEP_SECONDS) * EXECUTION_TIMEOUT_STEP_SECONDS;
  return Math.min(MAX_EXECUTION_TIMEOUT_SECONDS, Math.max(MIN_EXECUTION_TIMEOUT_SECONDS, stepped));
}

export function normalizeRunpodJobSettings(value: unknown): RunpodJobSettings {
  const record = value && typeof value === "object" ? (value as Partial<RunpodJobSettings>) : {};
  return {
    useWebhook: record.useWebhook === true,
    executionTimeoutSeconds: normalizeExecutionTimeoutSeconds(record.executionTimeoutSeconds)
  };
}

export function formatExecutionTimeoutLabel(seconds: number): string {
  if (seconds <= 0) {
    return "Endpoint default";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${minutes}m`;
}
