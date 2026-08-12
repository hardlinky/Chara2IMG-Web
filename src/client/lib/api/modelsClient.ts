export type LoraCatalog = {
  loras: string[];
  downloadUrls: Record<string, string>;
  triggerWords: Record<string, string[]>;
};

const MODEL_CATALOG_REFRESH_EVENT = "model-catalog-refresh";

let cache: LoraCatalog | null = null;
let pending: Promise<LoraCatalog> | null = null;

export function invalidateLoraCache(): void {
  cache = null;
  pending = null;
}

export function invalidateModelCatalogCaches(): void {
  invalidateLoraCache();
  checkpointCache = null;
  checkpointPending = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(MODEL_CATALOG_REFRESH_EVENT));
  }
}

export function subscribeModelCatalogRefresh(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(MODEL_CATALOG_REFRESH_EVENT, handler);
  return () => window.removeEventListener(MODEL_CATALOG_REFRESH_EVENT, handler);
}

export async function fetchAvailableLoras(): Promise<string[]> {
  return (await fetchLoraCatalog()).loras;
}

export async function fetchLoraCatalog(): Promise<LoraCatalog> {
  if (cache !== null) return cache;
  if (!pending) {
    pending = fetch("/api/models/loras", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { loras: [], downloadUrls: {}, triggerWords: {} }))
      .then((data: unknown) => {
        const result = data as { loras?: string[]; downloadUrls?: Record<string, string>; triggerWords?: Record<string, string[]> };
        cache = {
          loras: Array.isArray(result.loras) ? result.loras : [],
          downloadUrls: result.downloadUrls && typeof result.downloadUrls === "object" ? result.downloadUrls : {},
          triggerWords: result.triggerWords && typeof result.triggerWords === "object" ? result.triggerWords : {}
        };
        return cache;
      })
      .catch(() => {
        pending = null;
        return { loras: [], downloadUrls: {}, triggerWords: {} };
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
