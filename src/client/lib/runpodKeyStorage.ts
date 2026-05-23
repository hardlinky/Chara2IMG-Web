const RUNPOD_KEY_STORAGE_KEY = "runpod_api_key";

let inMemoryRunpodKey = "";

export function getRunpodKey(): string {
  if (inMemoryRunpodKey) {
    return inMemoryRunpodKey;
  }

  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(RUNPOD_KEY_STORAGE_KEY) ?? "";
}

export function setRunpodKey(value: string, rememberOnThisBrowser: boolean): void {
  inMemoryRunpodKey = value;

  if (typeof window === "undefined") {
    return;
  }

  if (rememberOnThisBrowser && value) {
    window.localStorage.setItem(RUNPOD_KEY_STORAGE_KEY, value);
    return;
  }

  window.localStorage.removeItem(RUNPOD_KEY_STORAGE_KEY);
}

export function clearRunpodKey(): void {
  inMemoryRunpodKey = "";

  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(RUNPOD_KEY_STORAGE_KEY);
}
