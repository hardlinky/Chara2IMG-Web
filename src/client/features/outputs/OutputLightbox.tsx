import { type SyntheticEvent, useState } from "react";
import { Gallery, Item } from "react-photoswipe-gallery";
import "photoswipe/dist/photoswipe.css";
import type { RecentJobOutputImage } from "../../../shared/contracts/jobs";
import { OutputImageCard } from "./OutputImageCard";

type OutputLightboxProps = {
  images: RecentJobOutputImage[];
  imagePrefix: string;
  maxVisible?: number;
  onRemoveImage?: (outputIndex: number) => void;
  onTogglePinnedImage?: (outputIndex: number, pinned: boolean) => void;
  onExportWorkflow?: () => void;
  onLoadInputs?: () => void;
  canPinMore?: boolean;
};

export function OutputLightbox({
  images,
  imagePrefix,
  maxVisible = images.length,
  onRemoveImage,
  onTogglePinnedImage,
  onExportWorkflow,
  onLoadInputs,
  canPinMore = true
}: OutputLightboxProps) {
  const [imageDimensions, setImageDimensions] = useState<Record<number, { width: number; height: number }>>({});
  const visibleImages = images.slice(0, maxVisible);

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
        {visibleImages.map((image, index) => {
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
                <div ref={ref as never}>
                  <OutputImageCard
                    image={image}
                    imagePrefix={imagePrefix}
                    imageLabel={`${index + 1}`}
                    onOpen={open}
                    onImageLoad={(event) => handleImageLoad(index, event)}
                    onRemoveImage={onRemoveImage ? () => onRemoveImage(image.outputIndex) : undefined}
                    onTogglePin={onTogglePinnedImage ? () => onTogglePinnedImage(image.outputIndex, !image.isPinned) : undefined}
                    onExportWorkflow={onExportWorkflow}
                    onLoadInputs={onLoadInputs}
                    canPinMore={canPinMore}
                  />
                </div>
              )}
            </Item>
          );
        })}
      </div>
    </Gallery>
  );
}
