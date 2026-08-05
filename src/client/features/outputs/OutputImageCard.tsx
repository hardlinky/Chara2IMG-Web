import { useEffect, useState } from "react";
import type { MouseEventHandler, ReactNode, SyntheticEvent } from "react";
import type { RecentJobOutputImage } from "../../../shared/contracts/jobs";
import { JOB_IMAGE_TTL_MS } from "../../../shared/contracts/jobs";
import { getImage, storeImage } from "../../lib/imageCache";
import { AlbumStarButton } from "../albums/AlbumStarButton";
import type { AlbumStarProps } from "../albums/albumStar";

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
  onLoadIntoImg2Img?: () => void;
  canPinMore?: boolean;
  isPinning?: boolean;
  maxVisible?: boolean;
  badge?: ReactNode;
  albumStar?: AlbumStarProps;
};

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

function Img2ImgIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <rect x="3" y="4" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="m6 15 3.5-4 2.5 3 2-2.5L18 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 21h6m0 0-2.5-2.5M18 21l-2.5 2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
  onLoadIntoImg2Img,
  canPinMore = true,
  isPinning = false,
  maxVisible = true,
  badge,
  albumStar
}: OutputImageCardProps) {
  const showBottomActions = Boolean(onExportWorkflow || onLoadInputs || onViewJobOutputs || onLoadIntoImg2Img);
  const isArchived = image.isPinned && !image.cacheExpiresAt;
  const [imgBroken, setImgBroken] = useState(false);
  const isUrlBased = isJobApiImageUrl(image.dataUrl);
  const [isLoading, setIsLoading] = useState(isUrlBased);
  const [isAuthError, setIsAuthError] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  // Download progress 0-100 while streaming; null means length unknown (indeterminate).
  const [loadProgress, setLoadProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!isUrlBased) return;
    setIsLoading(true);
    setIsAuthError(false);
    setResolvedSrc(null);
    setLoadProgress(null);
    let cancelled = false;

    (async () => {
      // 1. Archived images skip IndexedDB cache — always fetch fresh from server
      if (!isArchived) {
        const cached = await getImage(image.dataUrl);
        if (cached && !cancelled) {
          setResolvedSrc(cached.dataUrl);
          setIsLoading(false);
          return;
        }
      }

      // 2. Cache miss (or archived) — fetch from server, streaming to report progress
      try {
        const res = await fetch(image.dataUrl, { credentials: "include" });
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) {
          setIsAuthError(true);
          setIsLoading(false);
          return;
        }
        if (!res.ok) {
          setImgBroken(true);
          setIsLoading(false);
          return;
        }

        const contentType = res.headers.get("Content-Type") || "image/png";
        const totalBytes = Number(res.headers.get("Content-Length") ?? "0");
        const bodyReader = res.body?.getReader();

        let blob: Blob;
        if (bodyReader) {
          const chunks: Uint8Array[] = [];
          let receivedBytes = 0;
          if (totalBytes > 0) {
            setLoadProgress(0);
          }
          for (;;) {
            const { done, value } = await bodyReader.read();
            if (done) break;
            if (cancelled) {
              void bodyReader.cancel();
              return;
            }
            if (value) {
              chunks.push(value);
              receivedBytes += value.length;
              if (totalBytes > 0) {
                setLoadProgress(Math.min(100, Math.round((receivedBytes / totalBytes) * 100)));
              }
            }
          }
          blob = new Blob(chunks as BlobPart[], { type: contentType });
        } else {
          blob = await res.blob();
        }
        if (cancelled) return;

        const reader = new FileReader();
        reader.onload = () => {
          if (cancelled) return;
          const dataUrl = reader.result as string;
          const mimeType = blob.type || "image/png";
          if (image.cacheExpiresAt) {
            void storeImage(image.dataUrl, dataUrl, mimeType, image.cacheExpiresAt);
          }
          setResolvedSrc(dataUrl);
          setIsLoading(false);
        };
        reader.onerror = () => {
          if (!cancelled) {
            setImgBroken(true);
            setIsLoading(false);
          }
        };
        reader.readAsDataURL(blob);
      } catch {
        if (!cancelled) {
          setImgBroken(true);
          setIsLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [image.dataUrl, image.cacheExpiresAt, image.isPinned, isArchived, isUrlBased]);

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
              {isLoading && isUrlBased ? (
                <div
                  className="outputs-image-loading"
                  aria-label="Loading image"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={loadProgress ?? undefined}
                >
                  {loadProgress === null ? (
                    <div className="outputs-image-loading-spinner" />
                  ) : (
                    <>
                      <div className="outputs-image-loading-track">
                        <div className="outputs-image-loading-fill" style={{ width: `${loadProgress}%` }} />
                      </div>
                      <span className="outputs-image-loading-pct">{loadProgress}%</span>
                    </>
                  )}
                </div>
              ) : null}
              <img
                src={isUrlBased ? (resolvedSrc ?? "") : image.dataUrl}
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
          className={`outputs-image-pin-btn ${image.isPinned ? "is-active" : ""} ${isPinning ? "is-loading" : ""}`.trim()}
          aria-label={image.isPinned ? `Unpin ${displayPrefix} image ${imageLabel}` : `Pin ${displayPrefix} image ${imageLabel}`}
          title={image.isPinned ? `Unpin ${displayPrefix} image ${imageLabel}` : `Pin ${displayPrefix} image ${imageLabel}`}
          disabled={isPinning || !onTogglePin || (!image.isPinned && !canPinMore)}
          onClick={onTogglePin}
        >
          {isPinning ? "⏳" : image.isPinned ? "📌" : "📍"}
        </button>
        {albumStar ? (
          <AlbumStarButton
            albums={albumStar.albums}
            memberAlbumIds={albumStar.memberAlbumIds}
            onToggleAlbum={albumStar.onToggleAlbum}
            onCreateAlbum={albumStar.onCreateAlbum}
            label={`Add ${displayPrefix} image ${imageLabel} to album`}
          />
        ) : null}
        {showBottomActions ? (
          <button
            type="button"
            className="outputs-image-action-btn outputs-image-download-btn"
            aria-label={`Download ${displayPrefix} image ${imageLabel}`}
            title={`Download ${displayPrefix} image ${imageLabel}`}
            onClick={() => triggerDownload(image, displayPrefix, imageLabel)}
          >
            <DownloadIcon />
          </button>
        ) : null}
        {showBottomActions ? (
          <div className="outputs-image-bottom-actions" aria-label={`Actions for ${displayPrefix} image ${imageLabel}`}>
            {onLoadIntoImg2Img ? (
              <button
                type="button"
                className="outputs-image-action-btn"
                aria-label={`Load ${displayPrefix} image ${imageLabel} into IMG2IMG input`}
                title={`Load ${displayPrefix} image ${imageLabel} into IMG2IMG input`}
                onClick={onLoadIntoImg2Img}
              >
                <Img2ImgIcon />
              </button>
            ) : null}
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
        {badge ? <span className="outputs-image-source-chip outputs-image-counter-chip">{badge}</span> : null}
      </div>
      {image.cacheExpiresAt && !isArchived ? (
        <div className="outputs-image-expiry-row">
          <div
            className="outputs-image-expiry-bar"
            style={{
              width: `${Math.max(0, Math.min(100, ((image.cacheExpiresAt - Date.now()) / JOB_IMAGE_TTL_MS) * 100))}%`,
            }}
            aria-label="Image expiry"
            role="progressbar"
            aria-valuenow={Math.max(0, Math.round(((image.cacheExpiresAt - Date.now()) / JOB_IMAGE_TTL_MS) * 100))}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      ) : null}

    </div>
  );
}
