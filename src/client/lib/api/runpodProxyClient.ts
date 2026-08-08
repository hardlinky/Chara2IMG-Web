export type RunpodRunPayload = {
  endpointId: string;
  apiKey: string;
  input: Record<string, unknown>;
  meta?: {
    workflowFileName?: string;
    draftValues?: Record<string, unknown>;
    templateFingerprint?: string;
  };
};

export type RunpodRunResponse = {
  id?: string;
  jobId?: string;
  status?: string;
  data?: unknown;
  output?: unknown;
  error?: unknown;
  [key: string]: unknown;
};

export type RunpodStatusPayload = {
  endpointId: string;
  apiKey: string;
  id: string;
};

export type RunpodStatusBatchPayload = {
  endpointId: string;
  apiKey: string;
  ids: string[];
  knownIds?: string[];
};

export type RunpodStatusResponse = {
  id?: string;
  status?: string;
  output?: unknown;
  error?: unknown;
  duration?: number;
  data?: unknown;
  [key: string]: unknown;
};

export type RunpodStatusBatchItem = {
  id: string;
  ok: boolean;
  statusCode?: number;
  data?: RunpodStatusResponse;
  error?: string;
};

export type RunpodStatusBatchResponse = {
  items: RunpodStatusBatchItem[];
};

export type RunpodCancelResponse = {
  id?: string;
  status?: string;
  data?: unknown;
  [key: string]: unknown;
};

export type SelfUpdateResult = {
  ok: boolean;
  before?: string;
  after?: string;
  steps?: Array<{
    name: string;
    stdout: string;
    stderr: string;
  }>;
  error?: string;
};

export type SystemConfig = {
  endpointId: string | null;
  hasRunpodApiKey: boolean;
  managedEndpointIds: string[];
};

export type AdminSessionResponse = {
  ok: boolean;
  admin: boolean;
};

export type SystemStorageStats = {
  ok: true;
  userUsedBytes: number;
  allUsersUsedBytes: number;
  totalCapacityBytes: number;
  source?: string;
};

function toSystemStorageStats(data: unknown): SystemStorageStats | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (record.ok !== true) {
    return null;
  }

  const userUsedBytes = Number(record.userUsedBytes);
  const allUsersUsedBytes = Number(record.allUsersUsedBytes);
  const totalCapacityBytes = Number(record.totalCapacityBytes);

  if (![userUsedBytes, allUsersUsedBytes, totalCapacityBytes].every((value) => Number.isFinite(value) && value >= 0)) {
    return null;
  }

  return {
    ok: true,
    userUsedBytes,
    allUsersUsedBytes,
    totalCapacityBytes,
    source: typeof record.source === "string" ? record.source : undefined
  };
}

export async function fetchSystemConfig(): Promise<SystemConfig> {
  const response = await fetch("/api/system/config", { cache: "no-store" });
  if (!response.ok) {
    return { endpointId: null, hasRunpodApiKey: false, managedEndpointIds: [] };
  }

  return (await response.json()) as SystemConfig;
}

export async function fetchAdminSession(): Promise<AdminSessionResponse> {
  const response = await fetch("/api/admin/session", {
    method: "GET",
    credentials: "include"
  });

  if (!response.ok) {
    return { ok: false, admin: false };
  }

  const payload = (await response.json()) as AdminSessionResponse;
  return payload;
}

export async function verifyAdminKeyViaProxy(key: string): Promise<AdminSessionResponse> {
  const response = await fetch("/api/admin/verify-key", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({ key })
  });

  if (!response.ok) {
    return { ok: false, admin: false };
  }

  const payload = (await response.json()) as AdminSessionResponse;
  return payload;
}

function getOrCreateStorageClientId(): string {
  if (typeof window === "undefined") {
    return "server-render";
  }

  const storageKey = "chara2imgPinnedImageClientId";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const generated = `client-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  window.localStorage.setItem(storageKey, generated);
  return generated;
}

export async function fetchSystemStorageStats(): Promise<SystemStorageStats> {
  const clientId = encodeURIComponent(getOrCreateStorageClientId());
  const fetchStatsFromPath = async (path: string): Promise<SystemStorageStats> => {
    const response = await fetch(path, {
      method: "GET",
      credentials: "include"
    });

    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      throw new ProxyRequestError(response.status, `System storage stats request failed (${response.status})`, data);
    }

    const parsed = toSystemStorageStats(data);
    if (!parsed) {
      throw new ProxyRequestError(response.status, `System storage stats response invalid (${response.status})`, data);
    }

    return parsed;
  };

  try {
    return await fetchStatsFromPath(`/api/system/storage?clientId=${clientId}`);
  } catch (primaryError) {
    try {
      return await fetchStatsFromPath(`/api/pinned-images/stats?clientId=${clientId}`);
    } catch {
      throw primaryError;
    }
  }
}

export class ProxyRequestError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data: unknown) {
    super(message);
    this.name = "ProxyRequestError";
    this.status = status;
    this.data = data;
  }
}

async function postProxy<TPayload>(path: string, payload: TPayload): Promise<unknown> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  const contentType = response.headers.get("Content-Type") ?? "";
  const isLikelyJson = contentType.includes("application/json");

  let data: unknown = null;
  if (text) {
    if (isLikelyJson) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    } else {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
  }

  if (!response.ok) {
    throw new ProxyRequestError(
      response.status,
      `Proxy request failed (${response.status}) ${typeof data === "string" ? data : JSON.stringify(data)}`,
      data
    );
  }

  return data;
}

export function runViaProxy(payload: RunpodRunPayload): Promise<RunpodRunResponse> {
  return postProxy("/api/runpod/run", payload) as Promise<RunpodRunResponse>;
}

export function statusViaProxy(payload: RunpodStatusPayload): Promise<RunpodStatusResponse> {
  return postProxy("/api/runpod/status", payload) as Promise<RunpodStatusResponse>;
}

export function statusBatchViaProxy(payload: RunpodStatusBatchPayload): Promise<RunpodStatusBatchResponse> {
  return postProxy("/api/runpod/status-batch", payload) as Promise<RunpodStatusBatchResponse>;
}

export function cancelViaProxy(payload: RunpodStatusPayload): Promise<RunpodCancelResponse> {
  return postProxy("/api/runpod/cancel", payload) as Promise<RunpodCancelResponse>;
}

export async function updateAppViaProxy(): Promise<SelfUpdateResult> {
  const response = await postProxy("/api/system/update", {});
  return response as SelfUpdateResult;
}
