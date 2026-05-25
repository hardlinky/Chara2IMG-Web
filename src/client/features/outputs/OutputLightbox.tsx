import { type SyntheticEvent, useState } from "react";
import { Gallery, Item } from "react-photoswipe-gallery";
import "photoswipe/dist/photoswipe.css";
import type { RecentJobOutputImage } from "../../../shared/contracts/jobs";

type OutputLightboxProps = {
  images: RecentJobOutputImage[];
  imagePrefix: string;
  maxVisible?: number;
  onRemoveImage?: (outputIndex: number) => void;
};

export function OutputLightbox({ images, imagePrefix, maxVisible = images.length, onRemoveImage }: OutputLightboxProps) {
  const [imageDimensions, setImageDimensions] = useState<Record<number, { width: number; height: number }>>({});

  const handleImageLoad = (index: number, event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalWidth <= 0 || naturalHeight <= 0) {
      return;
    }

    setImageDimensions((current) => {
      const existing = current[index];
      if (existing && existing.width === naturalWidth && existing.height === naturalHeight) {
        return current;
      }

      return {
        ...current,
        [index]: { width: naturalWidth, height: naturalHeight }
      };
    });
  };

  return (
    <Gallery
      options={{
        loop: true,
        allowPanToNext: false,
        preload: [1, 2],
        escKey: true,
        arrowKeys: true,
        pinchToClose: true,
        bgOpacity: 0.92,
        showHideAnimationType: "zoom",
        wheelToZoom: true
      }}
    >
      <div className="outputs-lightbox outputs-image-grid">
        {images.map((image, index) => {
          const dimensions = imageDimensions[index] ?? { width: 1024, height: 1024 };

          return (
            <Item
              key={`${image.sourcePath}-${index}`}
              original={image.dataUrl}
              thumbnail={image.dataUrl}
              width={String(dimensions.width)}
              height={String(dimensions.height)}
              caption={`${imagePrefix} #${index + 1}`}
            >
              {({ ref, open }) => (
                <div
                  className={`outputs-image-tile-wrapper ${index >= maxVisible ? "outputs-image-tile-hidden" : ""}`}
                >
                  <button
                    type="button"
                    className="outputs-image-tile"
                    onClick={open}
                    ref={ref as never}
                    aria-label={`Open ${imagePrefix} image ${index + 1}`}
                  >
                    <img src={image.dataUrl} alt={`${imagePrefix} ${index + 1}`} loading="lazy" onLoad={(event) => handleImageLoad(index, event)} />
                  </button>
                  {onRemoveImage ? (
                    <button
                      type="button"
                      className="outputs-image-remove-btn"
                      aria-label={`Remove ${imagePrefix} image ${index + 1}`}
                      onClick={() => onRemoveImage(image.outputIndex)}
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              )}
            </Item>
          );
        })}
      </div>
    </Gallery>
  );
}
