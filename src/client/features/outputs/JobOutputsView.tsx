import { useMemo, useState } from "react";
import type { RecentJobOutputCluster } from "../../../shared/contracts/jobs";
import { OutputLightbox } from "./OutputLightbox";

type JobOutputsViewProps = {
  cluster: RecentJobOutputCluster;
  onBack: () => void;
  onNextJob?: () => void;
};

const PAGE_SIZE = 24;

function toRelativeTimestamp(isoValue: string | null): string {
  if (!isoValue) {
    return "just now";
  }

  const deltaMs = Date.now() - Date.parse(isoValue);
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    return "just now";
  }

  const deltaMinutes = Math.floor(deltaMs / 60000);
  if (deltaMinutes < 1) {
    return "just now";
  }
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}

export function JobOutputsView({ cluster, onBack, onNextJob }: JobOutputsViewProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const visibleImages = useMemo(() => cluster.outputs.slice(0, visibleCount), [cluster.outputs, visibleCount]);

  return (
    <section className="outputs-job-view">
      <div className="outputs-job-view-actions">
        <button type="button" onClick={onBack}>
          Back to gallery
        </button>
        {onNextJob ? (
          <button type="button" onClick={onNextJob}>
            Next job
          </button>
        ) : null}
      </div>

      <p className="outputs-provenance-line">
        {cluster.jobId} | {toRelativeTimestamp(cluster.finishedAt ?? cluster.submittedAt)} | {cluster.workflowFileName ?? "Workflow unknown"}
      </p>

      <OutputLightbox images={cluster.outputs} imagePrefix={cluster.jobId} maxVisible={visibleCount} />

      {visibleImages.length < cluster.outputs.length ? (
        <div className="outputs-job-view-more">
          <button type="button" onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}>
            Load more images
          </button>
        </div>
      ) : null}
    </section>
  );
}
