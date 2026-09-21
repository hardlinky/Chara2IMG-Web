import { describe, expect, it } from "vitest";
import { stripEmbeddedImageData } from "../../src/shared/logSafeText";
import { describeProxyErrorBody } from "../../src/client/lib/api/runpodProxyClient";

const base64Blob = "A".repeat(600);

describe("stripEmbeddedImageData", () => {
  it("removes data URLs", () => {
    const result = stripEmbeddedImageData(`before data:image/png;base64,${base64Blob} after`);

    expect(result).toBe("before [image data omitted] after");
  });

  it("removes bare base64 blobs", () => {
    const result = stripEmbeddedImageData(`{"base64_data":"${base64Blob}"}`);

    expect(result).toBe('{"base64_data":"[image data omitted]"}');
  });

  it("leaves ordinary text and short identifiers alone", () => {
    const message = "Node 'Model Input Switch' not found (job 9f2a1b3c-4d5e).";

    expect(stripEmbeddedImageData(message)).toBe(message);
  });
});

describe("describeProxyErrorBody", () => {
  it("prefers the error field over dumping the whole body", () => {
    const detail = describeProxyErrorBody({
      ok: false,
      error: "Insufficient credits",
      input: { workflow: { "863": { inputs: { base64_data: base64Blob } } } }
    });

    expect(detail).toBe("Insufficient credits");
  });

  it("uses the nested details message when present", () => {
    expect(describeProxyErrorBody({ error: "", details: { message: "Upstream timeout" } })).toBe("Upstream timeout");
  });

  it("scrubs image data and caps the length when only a raw body is available", () => {
    const detail = describeProxyErrorBody({ input: { base64_data: base64Blob } });

    expect(detail).not.toContain("AAAA");
    expect(detail).toContain("[image data omitted]");
    expect(detail.length).toBeLessThanOrEqual(201);
  });

  it("returns an empty string for an empty body", () => {
    expect(describeProxyErrorBody(null)).toBe("");
  });
});
