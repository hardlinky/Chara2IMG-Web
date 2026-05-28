import { useEffect, useMemo, useState } from "react";
import type { RecentJobOutputCluster } from "../../../shared/contracts/jobs";
import { JobOutputsView } from "./JobOutputsView";
import { OutputImageCard } from "./OutputImageCard";
import { OUTPUT_DENSITIES, type OutputDensity, useOutputGallery } from "./useOutputGallery";
import "./outputsGallery.css";
import "../../styles/jobsOutput.css";

type OutputsGalleryMode = "per-job" | "all-images";
type OutputsPinFilter = "all" | "pinned" | "unpinned";
const MOBILE_OUTPUT_DENSITIES: readonly OutputDensity[] = ["compact", "balanced"];
const ALL_IMAGES_PAGE_SIZE = 48;

type OutputsTabProps = {
  clusters: RecentJobOutputCluster[];
  onRerun: (jobId: string) => void;
  onLoadInputs: (jobId: string) => void;
  onRemoveJobOutputs: (jobId: string) => void;
  onRemoveOutputImage: (jobId: string, outputIndex: number) => void;
  onExportWorkflow?: (jobId: string) => void;
  onToggleOutputPinned?: (jobId: string, outputIndex: number, pinned: boolean) => void;
  canPinMore?: boolean;
};

function getGalleryClassName(density: (typeof OUTPUT_DENSITIES)[number]): string {
  return `outputs-gallery outputs-gallery-${density}`;
}

export function OutputsTab({ clusters, onRerun, onLoadInputs, onRemoveJobOutputs, onRemoveOutputImage, onExportWorkflow, onToggleOutputPinned, canPinMore = true }: OutputsTabProps) {
  const gallery = useOutputGallery(clusters);
  const [galleryMode, setGalleryMode] = useState<OutputsGalleryMode>("per-job");
  const [pinFilter, setPinFilter] = useState<OutputsPinFilter>("all");
  const [allImagesVisibleCount, setAllImagesVisibleCount] = useState(ALL_IMAGES_PAGE_SIZE);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.matchMedia("(max-width: 600px)").matches : false));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 600px)");
    const onChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener("change", onChange);

    return () => {
      mediaQuery.removeEventListener("change", onChange);
    };
  }, []);

  const availableDensities = useMemo<readonly OutputDensity[]>(() => (isMobile ? MOBILE_OUTPUT_DENSITIES : OUTPUT_DENSITIES), [isMobile]);

  useEffect(() => {
    if (!availableDensities.includes(gallery.density)) {
      gallery.setDensity("balanced");
    }
  }, [availableDensities, gallery]);

  const pinnedImageCount = useMemo(
    () => clusters.reduce((count, cluster) => count + cluster.outputs.filter((output) => output.isPinned).length, 0),
    [clusters]
  );

  const filteredClusters = useMemo(() => {
    return clusters
      .map((cluster) => {
        const filteredOutputs = cluster.outputs.filter((output) => {
          if (pinFilter === "pinned") {
            return output.isPinned;
          }

          if (pinFilter === "unpinned") {
            return !output.isPinned;
          }

          return true;
        });

        if (filteredOutputs.length === 0) {
          return null;
        }

        return {
          ...cluster,
          outputCount: filteredOutputs.length,
          representative: filteredOutputs[0]!,
          outputs: filteredOutputs
        };
      })
      .filter((cluster): cluster is RecentJobOutputCluster => Boolean(cluster));
  }, [clusters, pinFilter]);

  const allOutputImages = useMemo(
    () =>
      filteredClusters.flatMap((cluster) =>
        cluster.outputs.map((output) => ({
          ...output,
          jobId: cluster.jobId
        }))
      ),
    [filteredClusters]
  );
  const visibleAllOutputImages = useMemo(
    () => allOutputImages.slice(0, allImagesVisibleCount),
    [allImagesVisibleCount, allOutputImages]
  );

  useEffect(() => {
    setAllImagesVisibleCount(ALL_IMAGES_PAGE_SIZE);
  }, [galleryMode, pinFilter]);

  // Expose openJobOutputs globally for cross-tab hack
  if (typeof window !== "undefined") {
    // @ts-ignore
    window.__openJobOutputs = gallery.openJobOutputs;
  }

  if (gallery.view.mode === "job" && gallery.selectedCluster) {
    return (
      <JobOutputsView
        cluster={gallery.selectedCluster}
        onBack={gallery.goBackToGallery}
        onPreviousJob={gallery.selectedClusterIndex > 0 ? gallery.goToPreviousJob : undefined}
        onNextJob={gallery.selectedClusterIndex >= 0 && gallery.selectedClusterIndex + 1 < clusters.length ? gallery.goToNextJob : undefined}
        onRerun={() => onRerun(gallery.selectedCluster!.jobId)}
        onLoadInputs={() => onLoadInputs(gallery.selectedCluster!.jobId)}
        onRemoveImage={(outputIndex) => onRemoveOutputImage(gallery.selectedCluster!.jobId, outputIndex)}
        onRemoveAllOutputs={() => {
          onRemoveJobOutputs(gallery.selectedCluster!.jobId);
          gallery.goBackToGallery();
        }}
        onExportWorkflow={onExportWorkflow ? () => onExportWorkflow(gallery.selectedCluster!.jobId) : undefined}
        onTogglePinnedImage={onToggleOutputPinned ? (outputIndex, pinned) => onToggleOutputPinned(gallery.selectedCluster!.jobId, outputIndex, pinned) : undefined}
        canPinMore={canPinMore}
      />
    );
  }

  return (
    <section className="outputs-panel">
      <header className="outputs-toolbar">
        <h2>Outputs</h2>
        <span className="outputs-pin-counter">Pins: {pinnedImageCount}</span>
        <div className="outputs-toolbar-controls">
          <label className="field outputs-view-toggle-field">
            View
            <button
              className="btn btn-secondary outputs-view-toggle-btn"
              type="button"
              onClick={() => setGalleryMode((current) => (current === "per-job" ? "all-images" : "per-job"))}
            >
              {galleryMode === "per-job" ? "Jobs" : "Images"}
            </button>
          </label>
          <label className="field">
            Filter
            <select className="select" value={pinFilter} onChange={(event) => setPinFilter(event.target.value as OutputsPinFilter)}>
              <option value="all">All images</option>
              <option value="pinned">Pinned only</option>
              <option value="unpinned">Unpinned only</option>
            </select>
          </label>
          <label className="field">
            Density
            <select className="select" value={gallery.density} onChange={(event) => gallery.setDensity(event.target.value as OutputDensity)}>
              {availableDensities.map((density) => (
                <option key={density} value={density}>
                  {density[0]?.toUpperCase()}
                  {density.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {clusters.length === 0 ? <p>No completed job outputs yet.</p> : null}
      {clusters.length > 0 && filteredClusters.length === 0 ? <p>No outputs match the selected pin filter.</p> : null}

      {galleryMode === "per-job" ? (
        <div className={getGalleryClassName(gallery.density)}>
          {filteredClusters.map((cluster) => (
            <article key={cluster.jobId} className="outputs-cluster-card">
              <OutputImageCard
                image={cluster.representative}
                imagePrefix={cluster.jobId}
                imageLabel="1"
                onOpen={() => gallery.openJobOutputs(cluster.jobId)}
                onRemoveImage={onRemoveOutputImage ? () => onRemoveOutputImage(cluster.jobId, cluster.representative.outputIndex) : undefined}
                onTogglePin={onToggleOutputPinned ? () => onToggleOutputPinned(cluster.jobId, cluster.representative.outputIndex, !cluster.representative.isPinned) : undefined}
                canPinMore={canPinMore}
                badge={`${cluster.outputCount} images`}
              />
              <div className="outputs-cluster-meta">
                <span>{cluster.jobId}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={getGalleryClassName(gallery.density)}>
          {visibleAllOutputImages.map((outputImage) => (
            <article key={`${outputImage.jobId}-${outputImage.outputIndex}`} className="outputs-cluster-card">
              <OutputImageCard
                image={outputImage}
                imagePrefix={outputImage.jobId}
                imageLabel={`${outputImage.outputIndex + 1}`}
                onOpen={() => gallery.openJobOutputs(outputImage.jobId)}
                onRemoveImage={onRemoveOutputImage ? () => onRemoveOutputImage(outputImage.jobId, outputImage.outputIndex) : undefined}
                onTogglePin={onToggleOutputPinned ? () => onToggleOutputPinned(outputImage.jobId, outputImage.outputIndex, !outputImage.isPinned) : undefined}
                canPinMore={canPinMore}
              />
              <div className="outputs-cluster-meta">
                <span>{outputImage.jobId}</span>
                <span>{`#${outputImage.outputIndex + 1}`}</span>
              </div>
            </article>
          ))}
          {visibleAllOutputImages.length < allOutputImages.length ? (
            <div className="outputs-job-view-more">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setAllImagesVisibleCount((current) => current + ALL_IMAGES_PAGE_SIZE)}
              >
                Load more images
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
