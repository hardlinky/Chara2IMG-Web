import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DownloadEntry } from "../../src/shared/contracts/modelDownloads";
import { DownloadCard, getCivitaiVersionStatus } from "../../src/client/features/access/ModelDownloadsPanel";

function entry(overrides: Partial<DownloadEntry> = {}): DownloadEntry {
  return {
    id: "download-1",
    source: "civitai",
    url: "https://civitai.com/models/123?modelVersionId=456",
    destPath: "loras",
    filename: "ink.safetensors",
    triggerWords: ["ink style", "bold lines"],
    status: "finished",
    bytesDownloaded: 10,
    totalBytes: 10,
    createdAt: "2026-08-08T00:00:00.000Z",
    completedAt: "2026-08-08T00:00:01.000Z",
    error: null,
    metadataUpdatedAt: "2026-08-08T00:00:02.000Z",
    civitaiModelId: 123,
    civitaiModelVersionId: 456,
    civitaiLatestModelVersionId: 789,
    ...overrides
  };
}

describe("model download metadata presentation", () => {
  it("shows metadata refresh and a link to a newer CivitAI version", () => {
    const html = renderToStaticMarkup(
      <DownloadCard entry={entry()} civitaiKey="" huggingfaceKey="" onUpdated={vi.fn()} />
    );

    expect(html).toContain("Fetch newest metadata");
    expect(html).toContain("2 trigger words");
    expect(html).toContain("Newer version available");
    expect(html).toContain("https://civitai.com/models/123?modelVersionId=789");
  });

  it("does not claim an ambiguous legacy download is current", () => {
    expect(getCivitaiVersionStatus(entry({ civitaiModelVersionId: undefined }))).toEqual({
      kind: "unknown",
      label: "Version comparison unavailable"
    });
  });
});