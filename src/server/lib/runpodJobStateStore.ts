import { isTerminalRunpodStatus } from "../../shared/contracts/jobs";

type RunpodJobStateRecord = {
  endpointId: string;
  jobId: string;
  status?: string;
  isTerminal: boolean;
  data: unknown;
  updatedAt: number;
};

const store = new Map<string, RunpodJobStateRecord>();

function toStoreKey(endpointId: string, jobId: string): string {
  return `${endpointId}:${jobId}`;
}

function getStatusFromData(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const candidate = (data as { status?: unknown }).status;
  return typeof candidate === "string" ? candidate : undefined;
}

export function getCachedRunpodJobState(endpointId: string, jobId: string): RunpodJobStateRecord | null {
  return store.get(toStoreKey(endpointId, jobId)) ?? null;
}

export function setCachedRunpodJobState(endpointId: string, jobId: string, data: unknown, now: number = Date.now()): RunpodJobStateRecord {
  const status = getStatusFromData(data);
  const record: RunpodJobStateRecord = {
    endpointId,
    jobId,
    status,
    isTerminal: Boolean(status && isTerminalRunpodStatus(status)),
    data,
    updatedAt: now
  };

  store.set(toStoreKey(endpointId, jobId), record);
  return record;
}

export function removeUnknownRunpodJobStates(endpointId: string, knownIds: string[]): void {
  const allowed = new Set(knownIds);

  for (const [key, record] of store.entries()) {
    if (record.endpointId !== endpointId) {
      continue;
    }

    if (!allowed.has(record.jobId)) {
      store.delete(key);
    }
  }
}

export function clearRunpodJobStateStore(): void {
  store.clear();
}
