import { useMemo, useState } from "react";
import type { RecentJobOutputCluster } from "../../../shared/contracts/jobs";
import { JobOutputsView } from "./JobOutputsView";
import { OutputImageCard } from "./OutputImageCard";
import { OUTPUT_DENSITIES, useOutputGallery } from "./useOutputGallery";
import "./outputsGallery.css";
import "../../styles/jobsOutput.css";

type OutputsGalleryMode = "per-job" | "all-images";

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

  const allOutputImages = useMemo(
    () =>
      clusters.flatMap((cluster) =>
        cluster.outputs.map((output) => ({
          ...output,
          jobId: cluster.jobId
        }))
      ),
    [clusters]
  );

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
            Density
            <select className="select" value={gallery.density} onChange={(event) => gallery.setDensity(event.target.value as (typeof OUTPUT_DENSITIES)[number])}>
              {OUTPUT_DENSITIES.map((density) => (
                <option key={density} value={density}>
                  {density}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {clusters.length === 0 ? <p>No completed job outputs yet.</p> : null}

      {galleryMode === "per-job" ? (
        <div className={getGalleryClassName(gallery.density)}>
          {clusters.map((cluster) => (
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
          {allOutputImages.map((outputImage) => (
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
        </div>
      )}
    </section>
  );
}
