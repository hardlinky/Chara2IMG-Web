export const RUNPOD_LIFECYCLE_OPERATIONS = ["run", "status", "cancel", "retry", "purge-queue"] as const;

export type RunpodLifecycleOperation = (typeof RUNPOD_LIFECYCLE_OPERATIONS)[number];

export type RunpodRunRequest = {
  endpointId: string;
  apiKey: string;
  input: Record<string, unknown>;
};

export type RunpodStatusRequest = {
  endpointId: string;
  apiKey: string;
  id: string;
};

export type RunpodCancelRequest = {
  endpointId: string;
  apiKey: string;
  id: string;
};

export type RunpodRetryRequest = {
  endpointId: string;
  apiKey: string;
  id: string;
};

export type RunpodPurgeQueueRequest = {
  endpointId: string;
  apiKey: string;
};
