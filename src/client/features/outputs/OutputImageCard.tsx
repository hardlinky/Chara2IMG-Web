import type { MouseEventHandler, ReactNode, SyntheticEvent } from "react";
import type { RecentJobOutputImage } from "../../../shared/contracts/jobs";

type OutputImageCardProps = {
  image: RecentJobOutputImage;
  imagePrefix: string;
  imageLabel: string;
  onOpen: MouseEventHandler<HTMLButtonElement>;
  onImageLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
  onRemoveImage?: () => void;
  onTogglePin?: () => void;
  onExportWorkflow?: () => void;
  onLoadInputs?: () => void;
  onViewJobOutputs?: () => void;
  canPinMore?: boolean;
  maxVisible?: boolean;
  badge?: ReactNode;
};

function isServerBackedImageUrl(value: string): boolean {
  return value.startsWith("/api/pinned-images/") || /\/api\/pinned-images\//.test(value);
}

function triggerDownload(image: RecentJobOutputImage, imagePrefix: string, imageLabel: string): void {
  const extension = image.mimeType === "image/jpeg" ? "jpg" : "png";
  const link = document.createElement("a");
  link.href = image.dataUrl;
  link.download = `${imagePrefix}-image-${imageLabel}.${extension}`;
  link.click();
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 20h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M8 8h8v8M16 8l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 5h6M5 5v6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LoadInputsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M4 7h16M4 12h10M4 17h7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 15h5v5m0-5-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ViewJobOutputsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M4 6h16M4 12h10M4 18h7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 10h5v5m0-5-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function OutputImageCard({
  image,
  imagePrefix,
  imageLabel,
  onOpen,
  onImageLoad,
  onRemoveImage,
  onTogglePin,
  onExportWorkflow,
  onLoadInputs,
  onViewJobOutputs,
  canPinMore = true,
  maxVisible = true,
  badge
}: OutputImageCardProps) {
  const showBottomActions = Boolean(onExportWorkflow || onLoadInputs || onViewJobOutputs);
  const storageSourceLabel = isServerBackedImageUrl(image.dataUrl) ? "Server backup" : "Browser cache";

  return (
    <div className={`outputs-image-tile-wrapper ${maxVisible ? "" : "outputs-image-tile-hidden"}`.trim()}>
      <button type="button" className="outputs-image-tile" onClick={onOpen} aria-label={`Open ${imagePrefix} image ${imageLabel}`}>
        <img src={image.dataUrl} alt={`${imagePrefix} ${imageLabel}`} loading="lazy" onLoad={onImageLoad} />
      </button>
      <div className="outputs-image-caption-row">
        <span className="outputs-image-caption-label">{`${imagePrefix} #${imageLabel}`}</span>
        <span className="outputs-image-source-chip">{storageSourceLabel}</span>
      </div>
      {badge ? <span className="outputs-count-badge">{badge}</span> : null}
      {onTogglePin ? (
        <button
          type="button"
          className={`outputs-image-pin-btn ${image.isPinned ? "is-active" : ""}`.trim()}
          aria-label={image.isPinned ? `Unpin ${imagePrefix} image ${imageLabel}` : `Pin ${imagePrefix} image ${imageLabel}`}
          title={image.isPinned ? `Unpin ${imagePrefix} image ${imageLabel}` : `Pin ${imagePrefix} image ${imageLabel}`}
          disabled={!image.isPinned && !canPinMore}
          onClick={onTogglePin}
        >
          {image.isPinned ? "📌" : "📍"}
        </button>
      ) : null}
      {showBottomActions ? (
        <div className="outputs-image-bottom-actions" aria-label={`Actions for ${imagePrefix} image ${imageLabel}`}>
          <button
            type="button"
            className="outputs-image-action-btn"
            aria-label={`Download ${imagePrefix} image ${imageLabel}`}
            title={`Download ${imagePrefix} image ${imageLabel}`}
            onClick={() => triggerDownload(image, imagePrefix, imageLabel)}
          >
            <DownloadIcon />
          </button>
          {onViewJobOutputs ? (
            <button
              type="button"
              className="outputs-image-action-btn"
              aria-label={`View job outputs for ${imagePrefix}`}
              title={`View job outputs for ${imagePrefix}`}
              onClick={onViewJobOutputs}
            >
              <ViewJobOutputsIcon />
            </button>
          ) : null}
          {onExportWorkflow ? (
            <button
              type="button"
              className="outputs-image-action-btn"
              aria-label={`Export workflow for ${imagePrefix}`}
              title={`Export workflow for ${imagePrefix}`}
              onClick={onExportWorkflow}
            >
              <ExportIcon />
            </button>
          ) : null}
          {onLoadInputs ? (
            <button
              type="button"
              className="outputs-image-action-btn"
              aria-label={`Load inputs from ${imagePrefix}`}
              title={`Load inputs from ${imagePrefix}`}
              onClick={onLoadInputs}
            >
              <LoadInputsIcon />
            </button>
          ) : null}
        </div>
      ) : null}
      {onRemoveImage ? (
        <button
          type="button"
          className="outputs-image-remove-btn"
          aria-label={`Remove ${imagePrefix} image ${imageLabel}`}
          title={`Remove ${imagePrefix} image ${imageLabel}`}
          onClick={onRemoveImage}
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
