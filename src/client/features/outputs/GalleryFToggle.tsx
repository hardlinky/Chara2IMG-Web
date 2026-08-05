import { type MutableRefObject, type ReactNode, useCallback, useEffect, useRef } from "react";
import { Gallery, useGallery } from "react-photoswipe-gallery";
import type PhotoSwipe from "photoswipe";
import type { PhotoSwipeOptions } from "photoswipe";

export type GalleryApi = { open: (index: number) => void; close: () => void };

// Bridges the Gallery's imperative open/close API up to the parent via ref.
function GalleryApiBridge({ apiRef }: { apiRef: MutableRefObject<GalleryApi | null> }) {
  apiRef.current = useGallery();
  return null;
}

type FToggleGalleryProps = {
  options: PhotoSwipeOptions;
  itemCount: number;
  children: ReactNode;
  apiRef?: MutableRefObject<GalleryApi | null>;
  onBeforeOpen?: (photoswipe: PhotoSwipe) => void;
  onTogglePinCurrent?: (index: number) => void;
  onDeleteCurrent?: (index: number) => void;
  onViewJobCurrent?: (index: number) => void;
  onLoadImg2ImgCurrent?: (index: number) => void;
};

// Wraps a PhotoSwipe Gallery and adds the "F" toggle: open the lightbox at the
// last-viewed slide (or the first slide if never opened) and close it again.
// While open, "p"/"Delete"/"j" act on the current slide.
export function FToggleGallery({
  options,
  itemCount,
  children,
  apiRef,
  onBeforeOpen,
  onTogglePinCurrent,
  onDeleteCurrent,
  onViewJobCurrent,
  onLoadImg2ImgCurrent
}: FToggleGalleryProps) {
  const internalApiRef = useRef<GalleryApi | null>(null);
  const galleryApiRef = apiRef ?? internalApiRef;

  const openRef = useRef(false);
  const lastIndexRef = useRef<number | null>(null);
  const pswpRef = useRef<PhotoSwipe | null>(null);
  const itemCountRef = useRef(itemCount);
  itemCountRef.current = itemCount;
  const onBeforeOpenRef = useRef(onBeforeOpen);
  onBeforeOpenRef.current = onBeforeOpen;
  const onTogglePinRef = useRef(onTogglePinCurrent);
  onTogglePinRef.current = onTogglePinCurrent;
  const onDeleteRef = useRef(onDeleteCurrent);
  onDeleteRef.current = onDeleteCurrent;
  const onViewJobRef = useRef(onViewJobCurrent);
  onViewJobRef.current = onViewJobCurrent;
  const onLoadImg2ImgRef = useRef(onLoadImg2ImgCurrent);
  onLoadImg2ImgRef.current = onLoadImg2ImgCurrent;

  const handleBeforeOpen = useCallback((photoswipe: PhotoSwipe) => {
    openRef.current = true;
    pswpRef.current = photoswipe;
    photoswipe.on("change", () => {
      lastIndexRef.current = photoswipe.currIndex;
    });
    photoswipe.on("destroy", () => {
      openRef.current = false;
      pswpRef.current = null;
    });
    onBeforeOpenRef.current?.(photoswipe);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
        return;
      }

      const key = event.key;

      if (key === "f" || key === "F") {
        event.preventDefault();
        if (openRef.current) {
          galleryApiRef.current?.close();
          return;
        }
        const count = itemCountRef.current;
        if (count <= 0) {
          return;
        }
        const index = Math.min(Math.max(0, lastIndexRef.current ?? 0), count - 1);
        galleryApiRef.current?.open(index);
        return;
      }

      if (!openRef.current) {
        return;
      }
      const currentIndex = pswpRef.current?.currIndex ?? lastIndexRef.current;
      if (currentIndex == null || currentIndex < 0) {
        return;
      }

      if (key === "p" || key === "P") {
        event.preventDefault();
        onTogglePinRef.current?.(currentIndex);
      } else if (key === "a" || key === "A") {
        // Mirror PhotoSwipe's Left/Right image navigation.
        event.preventDefault();
        pswpRef.current?.prev();
      } else if (key === "d" || key === "D") {
        event.preventDefault();
        pswpRef.current?.next();
      } else if (key === "Delete") {
        event.preventDefault();
        onDeleteRef.current?.(currentIndex);
      } else if (key === "j" || key === "J") {
        event.preventDefault();
        onViewJobRef.current?.(currentIndex);
      } else if (key === "i" || key === "I") {
        // No-op when the active workflow has no IMG2IMG input (ref is undefined)
        event.preventDefault();
        onLoadImg2ImgRef.current?.(currentIndex);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [galleryApiRef]);

  return (
    <Gallery options={options} onBeforeOpen={handleBeforeOpen}>
      <GalleryApiBridge apiRef={galleryApiRef} />
      {children}
    </Gallery>
  );
}
