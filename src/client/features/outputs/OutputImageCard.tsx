import type { MouseEventHandler, ReactNode } from "react";
import type { RecentJobOutputImage } from "../../../shared/contracts/jobs";

type OutputImageCardProps = {
  image: RecentJobOutputImage;
  imagePrefix: string;
  imageLabel: string;
  onOpen: MouseEventHandler<HTMLButtonElement>;
  onRemoveImage?: () => void;
  onTogglePin?: () => void;
  canPinMore?: boolean;
  maxVisible?: boolean;
  badge?: ReactNode;
};

export function OutputImageCard({
  image,
  imagePrefix,
  imageLabel,
  onOpen,
  onRemoveImage,
  onTogglePin,
  canPinMore = true,
  maxVisible = true,
  badge
}: OutputImageCardProps) {
  return (
    <div className={`outputs-image-tile-wrapper ${maxVisible ? "" : "outputs-image-tile-hidden"}`.trim()}>
      <button type="button" className="outputs-image-tile" onClick={onOpen} aria-label={`Open ${imagePrefix} image ${imageLabel}`}>
        <img src={image.dataUrl} alt={`${imagePrefix} ${imageLabel}`} loading="lazy" />
      </button>
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
