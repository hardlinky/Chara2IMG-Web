import { Gallery, Item } from "react-photoswipe-gallery";
import "photoswipe/dist/photoswipe.css";
import type { RecentJobOutputImage } from "../../../shared/contracts/jobs";

type OutputLightboxProps = {
  images: RecentJobOutputImage[];
  imagePrefix: string;
  maxVisible?: number;
};

export function OutputLightbox({ images, imagePrefix, maxVisible = images.length }: OutputLightboxProps) {
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
        {images.map((image, index) => (
          <Item
            key={`${image.sourcePath}-${index}`}
            original={image.dataUrl}
            thumbnail={image.dataUrl}
            width="1024"
            height="1024"
            caption={`${imagePrefix} #${index + 1}`}
          >
            {({ ref, open }) => (
              <button
                type="button"
                className={`outputs-image-tile ${index >= maxVisible ? "outputs-image-tile-hidden" : ""}`}
                onClick={open}
                ref={ref as never}
                aria-label={`Open ${imagePrefix} image ${index + 1}`}
              >
                <img src={image.dataUrl} alt={`${imagePrefix} ${index + 1}`} loading="lazy" />
              </button>
            )}
          </Item>
        ))}
      </div>
    </Gallery>
  );
}
