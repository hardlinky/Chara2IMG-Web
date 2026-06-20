import { useEffect, useState } from "react";
import type { MouseEventHandler, ReactNode, SyntheticEvent } from "react";
import type { RecentJobOutputImage } from "../../../shared/contracts/jobs";

function isJobApiImageUrl(value: string): boolean {
  return value.startsWith("/api/jobs/");
}

type OutputImageCardProps = {
  image: RecentJobOutputImage;
  imagePrefix: string;
  displayPrefix?: string;
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
  const link = document.createElement("a");
  link.href = image.dataUrl;
  if (isJobApiImageUrl(image.dataUrl)) {
    link.download = "";
  } else {
    const extension = image.mimeType === "image/jpeg" ? "jpg" : "png";
    link.download = `${imagePrefix}-image-${imageLabel}.${extension}`;
  }
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
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function CachedSourceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">
      <path d="M7 8V6a5 5 0 0 1 10 0v2m-9 0h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArchivedSourceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">
      <path d="M4 7h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 4h18v3H3zM9 12h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function OutputImageCard({
  image,
  imagePrefix,
  displayPrefix = imagePrefix,
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
  const isArchived = isServerBackedImageUrl(image.dataUrl);
  const storageSourceLabel = isArchived ? "Archived" : "Cached";
  const [imgBroken, setImgBroken] = useState(false);
  const isUrlBased = isJobApiImageUrl(image.dataUrl);
  const [isLoading, setIsLoading] = useState(isUrlBased);
  const [isAuthError, setIsAuthError] = useState(false);

  useEffect(() => {
    if (!isUrlBased) return;
    setIsLoading(true);
    setIsAuthError(false);
    let cancelled = false;
    fetch(image.dataUrl, { credentials: "include", method: "HEAD" })
      .then((res) => {
        if (!cancelled && (res.status === 401 || res.status === 403)) {
          setIsAuthError(true);
          setIsLoading(false);
        }
      })
      .catch(() => { /* network error — ignore, img onerror handles it */ });
    return () => { cancelled = true; };
  }, [image.dataUrl, isUrlBased]);

  return (
    <div className={`outputs-image-tile-wrapper ${maxVisible ? "" : "outputs-image-tile-hidden"}`.trim()}>
      <div className="outputs-image-media">
        <button type="button" className="outputs-image-tile" onClick={onOpen} aria-label={`Open ${displayPrefix} image ${imageLabel}`}>
          {imgBroken || isAuthError ? (
            isAuthError
              ? <div className="outputs-image-error">Session expired — please refresh</div>
              : <div className="outputs-image-broken" aria-label={`Image ${imageLabel} unavailable`}>⚠ Not available</div>
          ) : (
            <>
              {isLoading && isUrlBased ? <div className="outputs-image-loading" aria-label="Loading image" /> : null}
              <img
                src={image.dataUrl}
                alt={`${displayPrefix} ${imageLabel}`}
                loading="lazy"
                onLoad={(e) => { setIsLoading(false); onImageLoad?.(e); }}
                onError={() => setImgBroken(true)}
              />
            </>
          )}
        </button>
        <button
          type="button"
          className={`outputs-image-pin-btn ${image.isPinned ? "is-active" : ""}`.trim()}
          aria-label={image.isPinned ? `Unpin ${displayPrefix} image ${imageLabel}` : `Pin ${displayPrefix} image ${imageLabel}`}
          title={image.isPinned ? `Unpin ${displayPrefix} image ${imageLabel}` : `Pin ${displayPrefix} image ${imageLabel}`}
          disabled={!onTogglePin || (!image.isPinned && !canPinMore)}
          onClick={onTogglePin}
        >
          {image.isPinned ? "📌" : "📍"}
        </button>
        {showBottomActions ? (
          <div className="outputs-image-bottom-actions" aria-label={`Actions for ${displayPrefix} image ${imageLabel}`}>
            <button
              type="button"
              className="outputs-image-action-btn"
              aria-label={`Download ${displayPrefix} image ${imageLabel}`}
              title={`Download ${displayPrefix} image ${imageLabel}`}
              onClick={() => triggerDownload(image, displayPrefix, imageLabel)}
            >
              <DownloadIcon />
            </button>
            {onViewJobOutputs ? (
              <button
                type="button"
                className="outputs-image-action-btn"
                aria-label={`View job outputs for ${displayPrefix}`}
                title={`View job outputs for ${displayPrefix}`}
                onClick={onViewJobOutputs}
              >
                <ViewJobOutputsIcon />
              </button>
            ) : null}
            {onExportWorkflow ? (
              <button
                type="button"
                className="outputs-image-action-btn"
                aria-label={`Export workflow for ${displayPrefix}`}
                title={`Export workflow for ${displayPrefix}`}
                onClick={onExportWorkflow}
              >
                <ExportIcon />
              </button>
            ) : null}
            {onLoadInputs ? (
              <button
                type="button"
                className="outputs-image-action-btn"
                aria-label={`Load inputs from ${displayPrefix}`}
                title={`Load inputs from ${displayPrefix}`}
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
            aria-label={`Remove ${displayPrefix} image ${imageLabel}`}
            title={`Remove ${displayPrefix} image ${imageLabel}`}
            onClick={onRemoveImage}
          >
            ✕
          </button>
        ) : null}
      </div>
      <div className="outputs-image-caption-row">
        <span className="outputs-image-caption-label">{`${displayPrefix} #${imageLabel}`}</span>
        <span className="outputs-image-source-chip" title={isArchived ? "Loaded from server backup" : "Loaded from browser cache"}>
          {isArchived ? <ArchivedSourceIcon /> : <CachedSourceIcon />}
          <span>{storageSourceLabel}</span>
        </span>
        {badge ? <span className="outputs-image-source-chip outputs-image-counter-chip">{badge}</span> : null}
      </div>

    </div>
  );
}
