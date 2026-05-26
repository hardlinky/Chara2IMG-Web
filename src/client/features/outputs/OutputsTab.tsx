import type { RecentJobOutputCluster } from "../../../shared/contracts/jobs";
import { JobOutputsView } from "./JobOutputsView";
import { OUTPUT_DENSITIES, useOutputGallery } from "./useOutputGallery";
import "./outputsGallery.css";
import "../../styles/jobsOutput.css";

type OutputsTabProps = {
  clusters: RecentJobOutputCluster[];
  onRerun: (jobId: string) => void;
  onLoadInputs: (jobId: string) => void;
  onRemoveJobOutputs: (jobId: string) => void;
  onRemoveOutputImage: (jobId: string, outputIndex: number) => void;
  onExportWorkflow?: (jobId: string) => void;
  onTogglePinned?: (jobId: string, pinned: boolean) => void;
  canPinMore?: boolean;
};

function getGalleryClassName(density: (typeof OUTPUT_DENSITIES)[number]): string {
  return `outputs-gallery outputs-gallery-${density}`;
}

export function OutputsTab({ clusters, onRerun, onLoadInputs, onRemoveJobOutputs, onRemoveOutputImage, onExportWorkflow, onTogglePinned, canPinMore = true }: OutputsTabProps) {
  const gallery = useOutputGallery(clusters);

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
        onTogglePinned={onTogglePinned ? () => onTogglePinned(gallery.selectedCluster!.jobId, !gallery.selectedCluster!.isPinned) : undefined}
        canPinMore={canPinMore}
      />
    );
  }

  return (
    <section className="outputs-panel">
      <header className="outputs-toolbar">
        <h2>Outputs</h2>
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
      </header>

      {clusters.length === 0 ? <p>No completed job outputs yet.</p> : null}

      <div className={getGalleryClassName(gallery.density)}>
        {clusters.map((cluster) => (
          <article key={cluster.jobId} className="outputs-cluster-card">
            <button
              type="button"
              className="outputs-cluster-preview interactive"
              onClick={() => gallery.openJobOutputs(cluster.jobId)}
            >
              <img src={cluster.representative.dataUrl} alt={`Representative output for ${cluster.jobId}`} loading="lazy" />
              <span className="outputs-count-badge">{cluster.outputCount} images</span>
            </button>
            <div className="outputs-cluster-meta">
              <span>{cluster.jobId}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
