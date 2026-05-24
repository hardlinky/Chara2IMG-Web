import { describe, expect, it } from "vitest";
import { extractRunpodImagePreview, extractRunpodOutputImages } from "../../src/client/lib/runpodOutputImage";

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WvJwAAAAASUVORK5CYII=";
const tinyGifBase64 = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
const tinyJpegBase64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEA8QDw8PDxAPDw8QEA8QDw8PFREWFhURFRUYHSggGBolHRUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDQ0NDw0NDisZFRkrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrK//AABEIAAEAAQMBIgACEQEDEQH/xAAXAAEBAQEAAAAAAAAAAAAAAAAAAQID/8QAFhEBAQEAAAAAAAAAAAAAAAAAABEB/9oADAMBAAIQAxAAAAH0dP/EABgQAQADAQAAAAAAAAAAAAAAAAEAAhES/9oACAEBAAEFAru6Wf/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8BP//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8BP//Z";

describe("extractRunpodImagePreview", () => {
  it("extracts preview from data URL payload", () => {
    const response = {
      output: {
        images: [{ image: `data:image/png;base64,${tinyPngBase64}` }]
      }
    };

    const preview = extractRunpodImagePreview(response);
    expect(preview).not.toBeNull();
    expect(preview?.mimeType).toBe("image/png");
    expect(preview?.sourcePath).toContain("output");
  });

  it("extracts preview from plain base64 payload", () => {
    const response = {
      output: {
        images: [{ image: tinyPngBase64 }]
      }
    };

    const preview = extractRunpodImagePreview(response);
    expect(preview).not.toBeNull();
    expect(preview?.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("ignores non-image string values", () => {
    const response = {
      id: "abc-123",
      status: "COMPLETED",
      output: {
        text: "not an image"
      }
    };

    const preview = extractRunpodImagePreview(response);
    expect(preview).toBeNull();
  });

  it("extracts all valid images in deterministic traversal order", () => {
    const response = {
      output: {
        images: [
          { image: tinyPngBase64 },
          {
            nested: {
              image: `data:image/gif;base64,${tinyGifBase64}`
            }
          }
        ],
        secondary: {
          variants: [{ image: tinyJpegBase64 }]
        }
      }
    };

    const images = extractRunpodOutputImages(response);
    expect(images).toHaveLength(3);
    expect(images.map((item) => item.mimeType)).toEqual(["image/png", "image/gif", "image/jpeg"]);
    expect(images.map((item) => item.sourcePath)).toEqual([
      "$.output.images[0].image",
      "$.output.images[1].nested.image",
      "$.output.secondary.variants[0].image"
    ]);
  });

  it("excludes unsupported media and malformed data urls", () => {
    const response = {
      output: {
        images: [
          { image: "data:image/svg+xml;base64,PHN2Zy8+" },
          { image: "data:image/png;base64,not-base64" },
          { image: tinyPngBase64 }
        ]
      }
    };

    const images = extractRunpodOutputImages(response);
    expect(images).toHaveLength(1);
    expect(images[0]?.mimeType).toBe("image/png");
  });
});
