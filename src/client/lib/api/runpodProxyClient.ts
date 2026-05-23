export type RunpodRunPayload = {
  endpointId: string;
  apiKey: string;
  input: Record<string, unknown>;
};

export type RunpodStatusPayload = {
  endpointId: string;
  apiKey: string;
  id: string;
};

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
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Proxy request failed (${response.status}) ${JSON.stringify(data)}`);
  }

  return data;
}

export function runViaProxy(payload: RunpodRunPayload): Promise<unknown> {
  return postProxy("/api/runpod/run", payload);
}

export function statusViaProxy(payload: RunpodStatusPayload): Promise<unknown> {
  return postProxy("/api/runpod/status", payload);
}
