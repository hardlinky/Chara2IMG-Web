import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FToggleGallery } from "../../src/client/features/outputs/GalleryFToggle";

const galleryApis: Array<{ open: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = [];

vi.mock("react-photoswipe-gallery", async () => {
  const React = await import("react");
  return {
    Gallery: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useGallery: () => {
      const api = { open: vi.fn(), close: vi.fn() };
      galleryApis.push(api);
      return api;
    }
  };
});

const options = {};

describe("FToggleGallery keyboard ownership", () => {
  afterEach(() => {
    cleanup();
    galleryApis.length = 0;
  });

  it("opens only the active tab gallery when F is pressed", () => {
    render(
      <>
        <FToggleGallery active={false} options={options} itemCount={1}><div>Album</div></FToggleGallery>
        <FToggleGallery active options={options} itemCount={1}><div>Outputs</div></FToggleGallery>
      </>
    );

    fireEvent.keyDown(document, { key: "f" });

    expect(galleryApis[0]?.open).not.toHaveBeenCalled();
    expect(galleryApis[1]?.open).toHaveBeenCalledWith(0);
  });

  it("switches keyboard ownership in the opposite direction", () => {
    const { rerender } = render(
      <>
        <FToggleGallery active options={options} itemCount={1}><div>Album</div></FToggleGallery>
        <FToggleGallery active={false} options={options} itemCount={1}><div>Outputs</div></FToggleGallery>
      </>
    );
    rerender(
      <>
        <FToggleGallery active={false} options={options} itemCount={1}><div>Album</div></FToggleGallery>
        <FToggleGallery active options={options} itemCount={1}><div>Outputs</div></FToggleGallery>
      </>
    );

    fireEvent.keyDown(document, { key: "F" });

    expect(galleryApis[0]?.open).not.toHaveBeenCalled();
    expect(galleryApis.at(-1)?.open).toHaveBeenCalledWith(0);
  });
});