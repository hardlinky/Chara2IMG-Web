type ForwardRunpodRequestOptions = {
  endpointId: string;
  apiKey: string;
  operation: "run" | "status" | "cancel" | "retry" | "purge-queue";
  body?: Record<string, unknown>;
  id?: string;
};

function buildRunpodUrl(options: ForwardRunpodRequestOptions): string {
  const base = `https://api.runpod.ai/v2/${options.endpointId}/${options.operation}`;

  if ((options.operation === "status" || options.operation === "cancel" || options.operation === "retry") && options.id) {
    return `${base}/${options.id}`;
  }

  return base;
}

function resolveMethod(options: ForwardRunpodRequestOptions): "GET" | "POST" {
  if (options.operation === "status") {
    return "GET";
  }

  return "POST";
}

export async function forwardRunpodRequest(options: ForwardRunpodRequestOptions): Promise<Response> {
  const method = resolveMethod(options);

  return fetch(buildRunpodUrl(options), {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`
    },
    body: method === "GET" ? undefined : JSON.stringify(options.body ?? {})
  });
}
