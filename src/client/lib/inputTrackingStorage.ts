import { useSyncExternalStore } from "react";

const STORAGE_KEY = "chara2imgTrackedInputCategories";

let cache: string[] | null = null;
const listeners = new Set<() => void>();

function read(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function ensureCache(): string[] {
  if (cache === null) {
    cache = read();
  }
  return cache;
}

function write(next: string[]): void {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore write failures (e.g. storage disabled); in-memory cache still updates.
    }
  }
  for (const listener of listeners) {
    listener();
  }
}

export function getTrackedCategories(): string[] {
  return ensureCache();
}

export function isCategoryTracked(category: string): boolean {
  return ensureCache().includes(category);
}

export function setCategoryTracked(category: string, tracked: boolean): void {
  const current = ensureCache();
  const has = current.includes(category);
  if (tracked && !has) {
    write([...current, category]);
  } else if (!tracked && has) {
    write(current.filter((entry) => entry !== category));
  }
}

export function toggleCategoryTracked(category: string): void {
  setCategoryTracked(category, !isCategoryTracked(category));
}

export function subscribeTrackedCategories(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      cache = read();
      for (const listener of listeners) {
        listener();
      }
    }
  });
}

export function useTrackedInputCategories(): string[] {
  return useSyncExternalStore(subscribeTrackedCategories, getTrackedCategories, getTrackedCategories);
}
