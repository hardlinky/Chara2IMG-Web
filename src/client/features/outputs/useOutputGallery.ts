import { useCallback, useEffect, useMemo, useState } from "react";
import type { RecentJobOutputCluster } from "../../../shared/contracts/jobs";

export const OUTPUT_DENSITIES = ["compact", "balanced", "comfortable"] as const;
export type OutputDensity = (typeof OUTPUT_DENSITIES)[number];
const OUTPUT_DENSITY_STORAGE_KEY = "chara2imgOutputsDensity";

type GalleryView =
  | { mode: "gallery" }
  | { mode: "job"; jobId: string };

type ReturnContext = {
  scrollY: number;
  selectedJobId: string;
  density: OutputDensity;
};

export function useOutputGallery(clusters: RecentJobOutputCluster[]) {
  const [density, setDensity] = useState<OutputDensity>(() => {
    if (typeof window === "undefined") {
      return "balanced";
    }

    const stored = window.localStorage.getItem(OUTPUT_DENSITY_STORAGE_KEY);
    return stored === "compact" || stored === "balanced" || stored === "comfortable" ? stored : "balanced";
  });
  const [view, setView] = useState<GalleryView>({ mode: "gallery" });
  const [returnContext, setReturnContext] = useState<ReturnContext | null>(null);

  const selectedCluster = useMemo(() => {
    if (view.mode !== "job") {
      return null;
    }

    return clusters.find((cluster) => cluster.jobId === view.jobId) ?? null;
  }, [clusters, view]);

  const selectedClusterIndex = useMemo(() => {
    if (!selectedCluster) {
      return -1;
    }

    return clusters.findIndex((cluster) => cluster.jobId === selectedCluster.jobId);
  }, [clusters, selectedCluster]);

  const openJobOutputs = useCallback(
    (jobId: string) => {
      setReturnContext({
        scrollY: typeof window === "undefined" ? 0 : window.scrollY,
        selectedJobId: jobId,
        density
      });
      setView({ mode: "job", jobId });
    },
    [density]
  );

  const goBackToGallery = useCallback(() => {
    setView({ mode: "gallery" });
  }, []);

  const goToNextJob = useCallback(() => {
    if (selectedClusterIndex < 0 || selectedClusterIndex + 1 >= clusters.length) {
      return;
    }

    const nextJob = clusters[selectedClusterIndex + 1];
    if (!nextJob) {
      return;
    }

    setView({ mode: "job", jobId: nextJob.jobId });
  }, [clusters, selectedClusterIndex]);

  const goToPreviousJob = useCallback(() => {
    if (selectedClusterIndex <= 0) {
      return;
    }

    const previousJob = clusters[selectedClusterIndex - 1];
    if (!previousJob) {
      return;
    }

    setView({ mode: "job", jobId: previousJob.jobId });
  }, [clusters, selectedClusterIndex]);

  useEffect(() => {
    if (view.mode !== "gallery" || !returnContext) {
      return;
    }

    setDensity(returnContext.density);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: returnContext.scrollY, behavior: "auto" });
      });
    }
    setReturnContext(null);
  }, [returnContext, view]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(OUTPUT_DENSITY_STORAGE_KEY, density);
  }, [density]);

  return {
    density,
    setDensity,
    view,
    selectedCluster,
    selectedClusterIndex,
    openJobOutputs,
    goBackToGallery,
    goToPreviousJob,
    goToNextJob,
    returnContext
  };
}
