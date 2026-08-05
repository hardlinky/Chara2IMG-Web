import { type SyntheticEvent, useCallback, useEffect, useRef, useState } from "react";
import { Item } from "react-photoswipe-gallery";
import type PhotoSwipe from "photoswipe";
import "photoswipe/dist/photoswipe.css";
import type { RecentJobOutputImage } from "../../../shared/contracts/jobs";
import { FToggleGallery, type GalleryApi } from "./GalleryFToggle";
import { OutputImageCard } from "./OutputImageCard";

type OutputLightboxProps = {
  images: RecentJobOutputImage[];
  imagePrefix: string;
  displayPrefix?: string;
  maxVisible?: number;
  onRemoveImage?: (outputIndex: number) => void;
  onTogglePinnedImage?: (outputIndex: number, pinned: boolean) => void;
  onExportWorkflow?: () => void;
  onLoadInputs?: () => void;
  canPinMore?: boolean;
  pinningOutputIndices?: Set<number>;
  img2imgInputAvailable?: boolean;
  onLoadImageIntoImg2Img?: (imageUrl: string) => void;
  onPreviousJob?: () => void;
  onNextJob?: () => void;
  enableJobNav?: boolean;
};

export function OutputLightbox({
  images,
  imagePrefix,
  displayPrefix = imagePrefix,
  maxVisible = images.length,
  onRemoveImage,
  onTogglePinnedImage,
  onExportWorkflow,
  onLoadInputs,
  canPinMore = true,
  pinningOutputIndices,
  img2imgInputAvailable = false,
  onLoadImageIntoImg2Img,
  onPreviousJob,
  onNextJob,
  enableJobNav = false
}: OutputLightboxProps) {
  const [imageDimensions, setImageDimensions] = useState<Record<number, { width: number; height: number }>>({});
  const visibleImages = images.slice(0, maxVisible);

  const galleryApiRef = useRef<GalleryApi | null>(null);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  // Latest callbacks/flags for the imperative (open-time) keydown handler.
  const onPreviousJobRef = useRef(onPreviousJob);
  const onNextJobRef = useRef(onNextJob);
  const enableJobNavRef = useRef(enableJobNav);
  onPreviousJobRef.current = onPreviousJob;
  onNextJobRef.current = onNextJob;
  enableJobNavRef.current = enableJobNav;

  // Reopen coordination: the lightbox must be fully closed AND the new job's
  // images mounted before we reopen at index 0.
  const awaitingReopenRef = useRef(false);
  const closedRef = useRef(false);
  const imagesReadyRef = useRef(false);
  const currentJobRef = useRef(imagePrefix);

  const tryReopen = useCallback(() => {
    if (!awaitingReopenRef.current || !closedRef.current || !imagesReadyRef.current) {
      return;
    }
    awaitingReopenRef.current = false;
    closedRef.current = false;
    imagesReadyRef.current = false;

    const first = imagesRef.current[0];
    if (!first) {
      return;
    }

    // Resolve the new first image's natural size before opening so PhotoSwipe
    // fits it correctly instead of stretching it to the previous aspect ratio.
    const openFirst = () => requestAnimationFrame(() => galleryApiRef.current?.open(0));
    const probe = new Image();
    probe.onload = () => {
      if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        setImageDimensions((current) => ({ ...current, 0: { width: probe.naturalWidth, height: probe.naturalHeight } }));
        requestAnimationFrame(openFirst);
      } else {
        openFirst();
      }
    };
    probe.onerror = openFirst;
    probe.src = first.dataUrl;
  }, []);

  // On job change: drop stale per-index sizes and finish any pending reopen.
  useEffect(() => {
    if (currentJobRef.current === imagePrefix) {
      return;
    }
    currentJobRef.current = imagePrefix;
    setImageDimensions({});
    if (awaitingReopenRef.current) {
      imagesReadyRef.current = true;
      tryReopen();
    }
  }, [imagePrefix, tryReopen]);

  const requestJobSwitch = useCallback((direction: "prev" | "next") => {
    const handler = direction === "prev" ? onPreviousJobRef.current : onNextJobRef.current;
    if (!handler) {
      return; // boundary reached — no looping between jobs
    }
    awaitingReopenRef.current = true;
    closedRef.current = false;
    imagesReadyRef.current = false;
    galleryApiRef.current?.close();
    handler();
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // A/D image navigation is handled by FToggleGallery; this handler only
      // owns W/S job switching to avoid double-stepping images.
      if (!enableJobNavRef.current) {
        return;
      }
      const lower = event.key.toLowerCase();
      // W/S mirror Up/Down job navigation.
      if (event.key === "ArrowUp" || lower === "w") {
        event.preventDefault();
        requestJobSwitch("prev");
      } else if (event.key === "ArrowDown" || lower === "s") {
        event.preventDefault();
        requestJobSwitch("next");
      }
    },
    [requestJobSwitch]
  );

  const handleBeforeOpen = useCallback(
    (photoswipe: PhotoSwipe) => {
      document.addEventListener("keydown", handleKeyDown, true);
      photoswipe.on("destroy", () => {
        document.removeEventListener("keydown", handleKeyDown, true);
        if (awaitingReopenRef.current) {
          closedRef.current = true;
          tryReopen();
        }
      });
    },
    [handleKeyDown, tryReopen]
  );

  useEffect(() => () => document.removeEventListener("keydown", handleKeyDown, true), [handleKeyDown]);

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
    <FToggleGallery
      apiRef={galleryApiRef}
      itemCount={visibleImages.length}
      onBeforeOpen={handleBeforeOpen}
      onTogglePinCurrent={
        onTogglePinnedImage
          ? (index) => {
              const image = visibleImages[index];
              if (image) {
                onTogglePinnedImage(image.outputIndex, !image.isPinned);
              }
            }
          : undefined
      }
      onDeleteCurrent={
        onRemoveImage
          ? (index) => {
              const image = visibleImages[index];
              if (image) {
                onRemoveImage(image.outputIndex);
              }
            }
          : undefined
      }
      onLoadImg2ImgCurrent={
        img2imgInputAvailable && onLoadImageIntoImg2Img
          ? (index) => {
              const image = visibleImages[index];
              if (image) {
                onLoadImageIntoImg2Img(image.dataUrl);
                galleryApiRef.current?.close();
              }
            }
          : undefined
      }
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
          const aspectRatio = dimensions.width / dimensions.height;

          return (
            <Item
              key={`${image.sourcePath}-${index}`}
              original={image.dataUrl}
              thumbnail={image.dataUrl}
              width={String(dimensions.width)}
              height={String(dimensions.height)}
              caption={`${displayPrefix} #${index + 1}`}
            >
              {({ ref, open }) => (
                <div 
                  ref={ref as never} 
                  className="outputs-image-grid-item"
                  style={{ "--image-aspect": aspectRatio } as React.CSSProperties}
                >
                  <OutputImageCard
                    image={image}
                    imagePrefix={imagePrefix}
                    displayPrefix={displayPrefix}
                    imageLabel={`${index + 1}`}
                    onOpen={open}
                    onImageLoad={(event) => handleImageLoad(index, event)}
                    onRemoveImage={onRemoveImage ? () => onRemoveImage(image.outputIndex) : undefined}
                    onTogglePin={onTogglePinnedImage ? () => onTogglePinnedImage(image.outputIndex, !image.isPinned) : undefined}
                    onExportWorkflow={onExportWorkflow}
                    onLoadInputs={onLoadInputs}
                    onLoadIntoImg2Img={img2imgInputAvailable && onLoadImageIntoImg2Img ? () => onLoadImageIntoImg2Img(image.dataUrl) : undefined}
                    canPinMore={canPinMore}
                    isPinning={pinningOutputIndices?.has(image.outputIndex) ?? false}
                  />
                </div>
              )}
            </Item>
          );
        })}
      </div>
    </FToggleGallery>
  );
}
