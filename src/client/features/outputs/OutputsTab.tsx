import type { RecentJobOutputCluster } from "../../../shared/contracts/jobs";
import { JobOutputsView } from "./JobOutputsView";
import { OUTPUT_DENSITIES, useOutputGallery } from "./useOutputGallery";
import "./outputsGallery.css";

type OutputsTabProps = {
  clusters: RecentJobOutputCluster[];
};

function getGalleryClassName(density: (typeof OUTPUT_DENSITIES)[number]): string {
  return `outputs-gallery outputs-gallery-${density}`;
}

export function OutputsTab({ clusters }: OutputsTabProps) {
  const gallery = useOutputGallery(clusters);

  if (gallery.view.mode === "job" && gallery.selectedCluster) {
    return (
      <JobOutputsView
        cluster={gallery.selectedCluster}
        onBack={gallery.goBackToGallery}
        onNextJob={gallery.selectedClusterIndex >= 0 && gallery.selectedClusterIndex + 1 < clusters.length ? gallery.goToNextJob : undefined}
      />
    );
  }

  return (
    <section>
      <header className="outputs-header">
        <h2>Outputs</h2>
        <label>
          Density
          <select value={gallery.density} onChange={(event) => gallery.setDensity(event.target.value as (typeof OUTPUT_DENSITIES)[number])}>
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
            <button type="button" className="outputs-cluster-preview" onClick={() => gallery.openJobOutputs(cluster.jobId)}>
              <img src={cluster.representative.dataUrl} alt={`Representative output for ${cluster.jobId}`} loading="lazy" />
              <span className="outputs-count-badge">{cluster.outputCount} images</span>
            </button>
            <div className="outputs-cluster-meta">
              <span>{cluster.jobId}</span>
              <button type="button" onClick={() => gallery.openJobOutputs(cluster.jobId)}>
                View job outputs
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
