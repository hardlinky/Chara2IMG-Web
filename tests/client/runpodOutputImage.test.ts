import { describe, expect, it } from "vitest";
import { extractRunpodImagePreview } from "../../src/client/lib/runpodOutputImage";

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WvJwAAAAASUVORK5CYII=";

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
});
