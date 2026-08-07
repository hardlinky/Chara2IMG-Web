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
