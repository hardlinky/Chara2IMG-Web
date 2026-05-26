import { useMemo, useState } from "react";
import type { RecentJobOutputCluster } from "../../../shared/contracts/jobs";
import { OutputLightbox } from "./OutputLightbox";

type JobOutputsViewProps = {
  cluster: RecentJobOutputCluster;
  onBack: () => void;
  onPreviousJob?: () => void;
  onNextJob?: () => void;
  onRerun: () => void;
  onLoadInputs: () => void;
  onRemoveImage: (outputIndex: number) => void;
  onRemoveAllOutputs: () => void;
  onExportWorkflow?: () => void;
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

export function JobOutputsView({ cluster, onBack, onPreviousJob, onNextJob, onRerun, onLoadInputs, onRemoveImage, onRemoveAllOutputs, onExportWorkflow }: JobOutputsViewProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const visibleImages = useMemo(() => cluster.outputs.slice(0, visibleCount), [cluster.outputs, visibleCount]);

  return (
    <section className="outputs-job-view">
      <div className="outputs-job-view-actions">
        <div className="outputs-job-actions-row-1">
          <button className="btn btn-secondary" type="button" onClick={onBack}>
            Back
          </button>
          <div className="outputs-job-navigation">
            <button className="btn btn-primary" type="button" onClick={onPreviousJob} disabled={!onPreviousJob}>
              Prev
            </button>
            <button className="btn btn-primary" type="button" onClick={onNextJob} disabled={!onNextJob}>
              Next
            </button>
          </div>
          <div className="outputs-job-actions-spacer"></div>
          <div className="outputs-job-actions-group">
            <button className="btn btn-primary" type="button" onClick={onRerun}>
              Rerun
            </button>
            <button className="btn btn-secondary" type="button" onClick={onLoadInputs}>
              Load Inputs
            </button>
            {onExportWorkflow ? (
              <button className="btn btn-secondary" type="button" onClick={onExportWorkflow}>
                Export Workflow
              </button>
            ) : null}
          </div>
        </div>
        <div className="outputs-job-actions-row-2">
          <button className="btn btn-destructive" type="button" onClick={onRemoveAllOutputs}>
            Remove all outputs
          </button>
        </div>
      </div>

      <p className="outputs-provenance-line">
        {cluster.jobId} | {toRelativeTimestamp(cluster.finishedAt ?? cluster.submittedAt)} | {cluster.workflowFileName ?? "Workflow unknown"}
      </p>

      <OutputLightbox images={cluster.outputs} imagePrefix={cluster.jobId} maxVisible={visibleCount} onRemoveImage={onRemoveImage} />

      {visibleImages.length < cluster.outputs.length ? (
        <div className="outputs-job-view-more">
          <button className="btn btn-secondary" type="button" onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}>
            Load more images
          </button>
        </div>
      ) : null}
    </section>
  );
}
