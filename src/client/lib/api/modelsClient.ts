let cache: string[] | null = null;
let pending: Promise<string[]> | null = null;

export function invalidateLoraCache(): void {
  cache = null;
  pending = null;
}

export async function fetchAvailableLoras(): Promise<string[]> {
  if (cache !== null) return cache;
  if (!pending) {
    pending = fetch("/api/models/loras", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { loras: [] }))
      .then((data: unknown) => {
        const loras = (data as { loras?: string[] }).loras;
        cache = Array.isArray(loras) ? loras : [];
        return cache;
      })
      .catch(() => {
        pending = null;
        return [];
      });
  }
  return pending;
}

let checkpointCache: string[] | null = null;
let checkpointPending: Promise<string[]> | null = null;

export async function fetchAvailableCheckpoints(): Promise<string[]> {
  if (checkpointCache !== null) return checkpointCache;
  if (!checkpointPending) {
    checkpointPending = fetch("/api/models/checkpoints", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { checkpoints: [] }))
      .then((data: unknown) => {
        const checkpoints = (data as { checkpoints?: string[] }).checkpoints;
        checkpointCache = Array.isArray(checkpoints) ? checkpoints : [];
        return checkpointCache;
      })
      .catch(() => {
        checkpointPending = null;
        return [];
      });
  }
  return checkpointPending;
}
