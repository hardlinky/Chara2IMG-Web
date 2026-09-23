import {
  normalizeRunpodJobSettings,
  type RunpodJobSettings
} from "../../../shared/contracts/runpodSettings";

export type RunpodJobSettingsResponse = {
  settings: RunpodJobSettings;
  webhookBaseUrl: string | null;
};

function parseResponse(body: unknown): RunpodJobSettingsResponse {
  const record = body as { settings?: unknown; webhookBaseUrl?: unknown };
  return {
    settings: normalizeRunpodJobSettings(record?.settings),
    webhookBaseUrl: typeof record?.webhookBaseUrl === "string" ? record.webhookBaseUrl : null
  };
}

export async function fetchRunpodJobSettings(): Promise<RunpodJobSettingsResponse> {
  const res = await fetch("/api/admin/runpod-settings", { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to load RunPod job settings: ${res.status}`);
  }

  return parseResponse(await res.json());
}

export async function saveRunpodJobSettings(settings: RunpodJobSettings): Promise<RunpodJobSettingsResponse> {
  const res = await fetch("/api/admin/runpod-settings", {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings)
  });

  if (!res.ok) {
    throw new Error(`Failed to save RunPod job settings: ${res.status}`);
  }

  return parseResponse(await res.json());
}
