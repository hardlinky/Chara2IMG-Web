import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OutputLightbox } from "../../src/client/features/outputs/OutputLightbox";

vi.mock("react-photoswipe-gallery", async () => {
  const React = await import("react");

  return {
    Gallery: ({ children }: { children: React.ReactNode }) => <div data-gallery>{children}</div>,
    Item: ({ children }: { children: (args: { ref: null; open: () => void }) => React.ReactNode }) => (
      <>{children({ ref: null, open: () => undefined })}</>
    )
  };
});

const tinyPngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WvJwAAAAASUVORK5CYII=";

const sampleImages = [
  {
    dataUrl: tinyPngDataUrl,
    mimeType: "image/png" as const,
    sourcePath: "$.output.images[0].image",
    outputIndex: 0,
    isPinned: false
  },
  {
    dataUrl: tinyPngDataUrl,
    mimeType: "image/png" as const,
    sourcePath: "$.output.images[1].image",
    outputIndex: 1,
    isPinned: true
  }
];

describe("OutputLightbox", () => {
  it("renders job-scoped image tiles and hidden class for paginated overflow", () => {
    const html = renderToStaticMarkup(
      <OutputLightbox
        imagePrefix="job-1"
        maxVisible={1}
        images={sampleImages}
      />
    );

    expect(html).toContain("outputs-image-grid");
    expect(html).toContain("outputs-lightbox");
    expect(html).toContain("Open job-1 image 1");
    expect(html).toContain("Open job-1 image 2");
    expect(html).toContain("outputs-image-tile-hidden");
  });

  it("renders remove buttons when onRemoveImage is provided", () => {
    const html = renderToStaticMarkup(
      <OutputLightbox
        imagePrefix="job-1"
        images={sampleImages}
        onRemoveImage={() => undefined}
      />
    );

    expect(html).toContain("Remove job-1 image 1");
    expect(html).toContain("Remove job-1 image 2");
    expect(html).toContain("outputs-image-remove-btn");
  });

  it("does not render remove buttons when onRemoveImage is not provided", () => {
    const html = renderToStaticMarkup(
      <OutputLightbox
        imagePrefix="job-1"
        images={sampleImages}
      />
    );

    expect(html).not.toContain("outputs-image-remove-btn");
  });
});
