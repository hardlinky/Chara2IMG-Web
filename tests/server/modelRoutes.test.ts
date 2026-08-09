import { describe, expect, it } from "vitest";
import type { DownloadEntry } from "../../src/shared/contracts/modelDownloads";
import { buildLoraDownloadUrls, buildLoraTriggerWords } from "../../src/server/routes/models";

function download(overrides: Partial<DownloadEntry>): DownloadEntry {
  return {
    id: "download-1",
    source: "civitai",
    url: "https://civitai.com/models/123",
    destPath: "loras",
    filename: "style.safetensors",
    status: "finished",
    bytesDownloaded: 1,
    totalBytes: 1,
    createdAt: "2026-08-08T00:00:00.000Z",
    completedAt: "2026-08-08T00:00:01.000Z",
    error: null,
    ...overrides
  };
}

describe("model routes", () => {
  it("maps LoRA download records to their source URLs", () => {
    expect(buildLoraDownloadUrls([
      download({ destPath: "loras/styles", filename: "ink.safetensors" }),
      download({ id: "queued", status: "queued", filename: "queued.safetensors" }),
      download({ id: "checkpoint", destPath: "checkpoints", filename: "model.safetensors" })
    ])).toEqual({
      "styles/ink.safetensors": "https://civitai.com/models/123",
      "ink.safetensors": "https://civitai.com/models/123",
      "queued.safetensors": "https://civitai.com/models/123"
    });
  });

  it("maps stored trigger words by relative path and filename", () => {
    expect(buildLoraTriggerWords([
      download({ destPath: "loras/styles", filename: "ink.safetensors", triggerWords: ["ink style", "bold lines"] }),
      download({ id: "empty", filename: "empty.safetensors", triggerWords: [] }),
      download({ id: "checkpoint", destPath: "checkpoints", triggerWords: ["ignore"] })
    ])).toEqual({
      "styles/ink.safetensors": ["ink style", "bold lines"],
      "ink.safetensors": ["ink style", "bold lines"]
    });
  });
});