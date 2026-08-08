import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OutputImageCard } from "../../src/client/features/outputs/OutputImageCard";
import { getImage } from "../../src/client/lib/imageCache";

vi.mock("../../src/client/lib/imageCache", () => ({
  getImage: vi.fn(),
  storeImage: vi.fn()
}));

let intersectionCallback: IntersectionObserverCallback;

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "600px 0px";
  readonly thresholds = [0];

  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }

  disconnect = vi.fn();
  observe = vi.fn();
  takeRecords = vi.fn(() => []);
  unobserve = vi.fn();
}

describe("OutputImageCard", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.mocked(getImage).mockImplementation(() => new Promise(() => undefined));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("defers URL image cache and network work until the card approaches the viewport", async () => {
    render(
      <OutputImageCard
        image={{
          dataUrl: "/api/jobs/job-1/images/0",
          mimeType: "image/png",
          sourcePath: "/api/jobs/job-1/images/0",
          outputIndex: 0,
          isPinned: false
        }}
        imagePrefix="job-1"
        imageLabel="1"
        onOpen={() => undefined}
      />
    );

    expect(getImage).not.toHaveBeenCalled();

    act(() => {
      intersectionCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    await waitFor(() => expect(getImage).toHaveBeenCalledWith("/api/jobs/job-1/images/0"));
  });

  it("renders cached blobs through an object URL and revokes it on unmount", async () => {
    const blob = new Blob(["image"], { type: "image/png" });
    const createObjectURL = vi.fn(() => "blob:cached-image");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.mocked(getImage).mockResolvedValue({ blob, mimeType: "image/png" });

    const { unmount } = render(
      <OutputImageCard
        image={{
          dataUrl: "/api/jobs/job-1/images/0",
          mimeType: "image/png",
          sourcePath: "/api/jobs/job-1/images/0",
          outputIndex: 0,
          isPinned: false
        }}
        imagePrefix="job-1"
        imageLabel="1"
        onOpen={() => undefined}
      />
    );

    act(() => {
      intersectionCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(blob));
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cached-image");
  });
});