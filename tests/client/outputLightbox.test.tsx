import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { formatOutputJobId } from "../../src/client/features/outputs/formatOutputJobId";
import { OutputLightbox } from "../../src/client/features/outputs/OutputLightbox";

vi.mock("react-photoswipe-gallery", async () => {
  const React = await import("react");

  return {
    Gallery: ({ children }: { children: React.ReactNode }) => <div data-gallery>{children}</div>,
    Item: ({ children }: { children: (args: { ref: null; open: () => void }) => React.ReactNode }) => (
      <>{children({ ref: null, open: () => undefined })}</>
    ),
    useGallery: () => ({ open: () => undefined, close: () => undefined })
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
  it("renders only visible job-scoped image tiles when paginating", () => {
    const displayJobId = formatOutputJobId("job-1");
    const html = renderToStaticMarkup(
      <OutputLightbox
        imagePrefix="job-1"
        displayPrefix={displayJobId}
        maxVisible={1}
        images={sampleImages}
      />
    );

    expect(html).toContain("outputs-image-grid");
    expect(html).toContain("outputs-lightbox");
    expect(html).toContain(`Open ${displayJobId} image 1`);
    expect(html).not.toContain(`Open ${displayJobId} image 2`);
  });

  it("renders remove buttons when onRemoveImage is provided", () => {
    const displayJobId = formatOutputJobId("job-1");
    const html = renderToStaticMarkup(
      <OutputLightbox
        imagePrefix="job-1"
        displayPrefix={displayJobId}
        images={sampleImages}
        onRemoveImage={() => undefined}
      />
    );

    expect(html).toContain(`Remove ${displayJobId} image 1`);
    expect(html).toContain(`Remove ${displayJobId} image 2`);
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

  it("renders bottom icon action buttons when load/export handlers are provided", () => {
    const displayJobId = formatOutputJobId("job-1");
    const html = renderToStaticMarkup(
      <OutputLightbox
        imagePrefix="job-1"
        displayPrefix={displayJobId}
        images={sampleImages}
        onExportWorkflow={() => undefined}
        onLoadInputs={() => undefined}
      />
    );

    expect(html).toContain("outputs-image-bottom-actions");
    expect(html).toContain(`Download ${displayJobId} image 1`);
    expect(html).toContain(`Export workflow for ${displayJobId}`);
    expect(html).toContain(`Load inputs from ${displayJobId}`);
  });
});
