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
};

// Wraps a PhotoSwipe Gallery and adds the "F" toggle: open the lightbox at the
// last-viewed slide (or the first slide if never opened) and close it again.
export function FToggleGallery({ options, itemCount, children, apiRef, onBeforeOpen }: FToggleGalleryProps) {
  const internalApiRef = useRef<GalleryApi | null>(null);
  const galleryApiRef = apiRef ?? internalApiRef;

  const openRef = useRef(false);
  const lastIndexRef = useRef<number | null>(null);
  const itemCountRef = useRef(itemCount);
  itemCountRef.current = itemCount;
  const onBeforeOpenRef = useRef(onBeforeOpen);
  onBeforeOpenRef.current = onBeforeOpen;

  const handleBeforeOpen = useCallback((photoswipe: PhotoSwipe) => {
    openRef.current = true;
    photoswipe.on("change", () => {
      lastIndexRef.current = photoswipe.currIndex;
    });
    photoswipe.on("destroy", () => {
      openRef.current = false;
    });
    onBeforeOpenRef.current?.(photoswipe);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "f" && event.key !== "F") {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
        return;
      }
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
