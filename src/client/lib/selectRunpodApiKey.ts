export const SERVER_MANAGED_RUNPOD_KEY = "__SERVER_MANAGED_RUNPOD_KEY__";

export function selectRunpodApiKey(input: {
  endpointId: string;
  managedEndpointIds: string[];
  hasServerRunpodApiKey: boolean;
  browserRunpodApiKey: string;
}): { apiKey: string; canOverride: boolean } {
  const endpointId = input.endpointId.trim();
  const usesServerKey = input.hasServerRunpodApiKey
    && input.managedEndpointIds.some((managedEndpointId) => managedEndpointId === endpointId);

  return {
    apiKey: usesServerKey ? SERVER_MANAGED_RUNPOD_KEY : input.browserRunpodApiKey,
    canOverride: !usesServerKey
  };
}