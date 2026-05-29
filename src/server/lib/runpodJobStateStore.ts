import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isTerminalRunpodStatus, normalizeRunpodStatus } from "../../shared/contracts/jobs";
import { logServerWarning } from "./logger";

type RunpodJobStateRecord = {
  endpointId: string;
  jobId: string;
  status?: string;
  isTerminal: boolean;
  data: unknown;
  updatedAt: number;
};

const store = new Map<string, RunpodJobStateRecord>();
const persistedSuccessfulStore = new Map<string, RunpodJobStateRecord>();

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(CURRENT_DIR, "../../..");
const PERSISTED_STATE_FILE = (() => {
  const configured = process.env.RUNPOD_COMPLETED_STATE_FILE?.trim();
  if (configured) {
    return resolve(PROJECT_ROOT, configured);
  }

  return resolve(tmpdir(), "chara2img", "runpod-completed-states.v1.json");
})();

function toStoreKey(endpointId: string, jobId: string): string {
  return `${endpointId}:${jobId}`;
}

function isSuccessfulTerminalStatus(status: string | undefined): boolean {
  if (!status) {
    return false;
  }

  return normalizeRunpodStatus(status) === "COMPLETED";
}

function persistSuccessfulStates(): void {
  const records = [...persistedSuccessfulStore.values()];

  if (records.length === 0) {
    try {
      rmSync(PERSISTED_STATE_FILE, { force: true });
    } catch (error) {
      logServerWarning("Failed to remove empty persisted Runpod state file", error, {
        file: PERSISTED_STATE_FILE
      });
    }
    return;
  }

  const parentDir = dirname(PERSISTED_STATE_FILE);
  mkdirSync(parentDir, { recursive: true });
  writeFileSync(PERSISTED_STATE_FILE, JSON.stringify(records), "utf8");
}

function loadPersistedSuccessfulStates(): void {
  let raw: string;
  try {
    raw = readFileSync(PERSISTED_STATE_FILE, "utf8");
  } catch {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return;
    }

    for (const value of parsed) {
      if (!value || typeof value !== "object") {
        continue;
      }

      const record = value as Partial<RunpodJobStateRecord>;
      if (typeof record.endpointId !== "string" || typeof record.jobId !== "string") {
        continue;
      }

      if (typeof record.updatedAt !== "number" || !Number.isFinite(record.updatedAt)) {
        continue;
      }

      const status = typeof record.status === "string" ? record.status : getStatusFromData(record.data);
      if (!isSuccessfulTerminalStatus(status)) {
        continue;
      }

      const next: RunpodJobStateRecord = {
        endpointId: record.endpointId,
        jobId: record.jobId,
        status,
        isTerminal: true,
        data: record.data,
        updatedAt: record.updatedAt
      };

      persistedSuccessfulStore.set(toStoreKey(next.endpointId, next.jobId), next);
      store.set(toStoreKey(next.endpointId, next.jobId), next);
    }
  } catch (error) {
    logServerWarning("Failed to load persisted Runpod completed states", error, {
      file: PERSISTED_STATE_FILE
    });
  }
}

function getStatusFromData(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const candidate = (data as { status?: unknown }).status;
  return typeof candidate === "string" ? candidate : undefined;
}

export function getCachedRunpodJobState(endpointId: string, jobId: string): RunpodJobStateRecord | null {
  const key = toStoreKey(endpointId, jobId);
  const existing = store.get(key);
  if (existing) {
    return existing;
  }

  const persisted = persistedSuccessfulStore.get(key) ?? null;
  if (persisted) {
    store.set(key, persisted);
  }

  return persisted;
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

  const key = toStoreKey(endpointId, jobId);
  store.set(key, record);

  if (record.isTerminal && isSuccessfulTerminalStatus(record.status)) {
    persistedSuccessfulStore.set(key, record);
    persistSuccessfulStates();
  } else if (persistedSuccessfulStore.delete(key)) {
    persistSuccessfulStates();
  }

  return record;
}

export function consumeSuccessfulRunpodJobState(endpointId: string, jobId: string): void {
  const key = toStoreKey(endpointId, jobId);
  const inMemory = store.get(key);
  if (inMemory && isSuccessfulTerminalStatus(inMemory.status)) {
    store.delete(key);
  }

  if (persistedSuccessfulStore.delete(key)) {
    persistSuccessfulStates();
  }
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
  persistedSuccessfulStore.clear();

  try {
    rmSync(PERSISTED_STATE_FILE, { force: true });
  } catch (error) {
    logServerWarning("Failed to clear persisted Runpod state file", error, {
      file: PERSISTED_STATE_FILE
    });
  }
}

loadPersistedSuccessfulStates();
