const ENDPOINT_ID_KEY = "runpod_endpoint_id";

export function getStoredEndpointId(): string | null {
  return localStorage.getItem(ENDPOINT_ID_KEY) || null;
}

export function saveEndpointId(value: string): void {
  if (value) {
    localStorage.setItem(ENDPOINT_ID_KEY, value);
  } else {
    localStorage.removeItem(ENDPOINT_ID_KEY);
  }
}
