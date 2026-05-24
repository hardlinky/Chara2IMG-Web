export type RunpodRunPayload = {
  endpointId: string;
  apiKey: string;
  input: Record<string, unknown>;
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

export type RunpodStatusResponse = {
  id?: string;
  status?: string;
  output?: unknown;
  error?: unknown;
  duration?: number;
  data?: unknown;
  [key: string]: unknown;
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

export function cancelViaProxy(payload: RunpodStatusPayload): Promise<RunpodCancelResponse> {
  return postProxy("/api/runpod/cancel", payload) as Promise<RunpodCancelResponse>;
}

export async function updateAppViaProxy(): Promise<SelfUpdateResult> {
  const response = await postProxy("/api/system/update", {});
  return response as SelfUpdateResult;
}
