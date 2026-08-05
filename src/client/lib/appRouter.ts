import { useEffect, useState } from "react";

// Minimal shared route store backed by URL query params (?tab=...&job=...).
// Multiple components can own separate params without clobbering each other:
// App owns `tab`, OutputsTab owns `job`. navigate() merges into existing params.

export type AppRoute = {
  tab: string | null;
  jobId: string | null;
};

type RouteUpdate = {
  tab?: string;
  jobId?: string | null;
};

type Listener = () => void;

const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getRoute(): AppRoute {
  if (typeof window === "undefined") {
    return { tab: null, jobId: null };
  }

  const params = new URLSearchParams(window.location.search);
  return { tab: params.get("tab"), jobId: params.get("job") };
}

export function navigate(update: RouteUpdate, mode: "push" | "replace" = "push"): void {
  if (typeof window === "undefined") {
    return;
  }

  const params = new URLSearchParams(window.location.search);

  if (update.tab !== undefined) {
    params.set("tab", update.tab);
  }

  if (update.jobId !== undefined) {
    if (update.jobId) {
      params.set("job", update.jobId);
    } else {
      params.delete("job");
    }
  }

  const search = params.toString();
  const url = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;

  if (mode === "replace") {
    window.history.replaceState(null, "", url);
  } else {
    window.history.pushState(null, "", url);
  }

  notify();
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", notify);
}

export function useRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(getRoute);

  useEffect(() => {
    const listener = () => setRoute(getRoute());
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return route;
}
