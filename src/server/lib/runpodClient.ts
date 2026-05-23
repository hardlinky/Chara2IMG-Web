type ForwardRunpodRequestOptions = {
  endpointId: string;
  apiKey: string;
  operation: "run" | "status" | "cancel" | "retry" | "purge-queue";
  body: Record<string, unknown>;
};

function buildRunpodUrl(endpointId: string, operation: ForwardRunpodRequestOptions["operation"]): string {
  return `https://api.runpod.ai/v2/${endpointId}/${operation}`;
}

export async function forwardRunpodRequest(options: ForwardRunpodRequestOptions): Promise<Response> {
  return fetch(buildRunpodUrl(options.endpointId, options.operation), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`
    },
    body: JSON.stringify(options.body)
  });
}
