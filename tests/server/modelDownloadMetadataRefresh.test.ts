import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("model download metadata refresh", () => {
  let downloadsDir: string;

  beforeEach(async () => {
    downloadsDir = await mkdtemp(join(tmpdir(), "model-metadata-"));
    process.env.DOWNLOADS_LOG_DIR = downloadsDir;
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.DOWNLOADS_LOG_DIR;
    vi.unstubAllGlobals();
    await rm(downloadsDir, { recursive: true, force: true });
  });

  it("updates trigger words and reports the latest version for an existing record", async () => {
    const store = await import("../../src/server/lib/modelDownloadStore");
    await store.initDownloadStore();
    const entry = await store.addDownload(
      "https://civitai.com/models/123?modelVersionId=456",
      "loras",
      "civitai",
      "ink.safetensors"
    );
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(
      String(url).includes("model-versions")
        ? {
            id: 456,
            modelId: 123,
            trainedWords: ["ink style", "bold lines"],
            images: [{ url: "https://image.civitai.com/first.jpeg" }, { url: "https://image.civitai.com/second.jpeg" }]
          }
        : { modelVersions: [{ id: 789 }, { id: 456 }] }
    ), { status: 200, headers: { "Content-Type": "application/json" } })));
    const { refreshDownloadMetadata } = await import("../../src/server/lib/modelDownloader");

    const result = await refreshDownloadMetadata(entry.id, "secret");

    expect(result).toMatchObject({
      ok: true,
      entry: {
        triggerWords: ["ink style", "bold lines"],
        previewUrl: "https://image.civitai.com/first.jpeg",
        civitaiModelId: 123,
        civitaiModelVersionId: 456,
        civitaiLatestModelVersionId: 789
      }
    });
    expect(result.ok && result.entry.metadataUpdatedAt).toBeTruthy();
  });

  it("falls back to the latest version preview when the URL has no version", async () => {
    const store = await import("../../src/server/lib/modelDownloadStore");
    await store.initDownloadStore();
    const entry = await store.addDownload("https://civitai.com/models/123", "loras", "civitai", "ink.safetensors");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      modelVersions: [{ id: 789, trainedWords: [], images: [{ url: "https://image.civitai.com/latest.jpeg" }] }]
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const { refreshDownloadMetadata } = await import("../../src/server/lib/modelDownloader");

    const result = await refreshDownloadMetadata(entry.id, "secret");

    expect(result.ok && result.entry.previewUrl).toBe("https://image.civitai.com/latest.jpeg");
  });

  it("ignores preview entries that are not http URLs", async () => {
    const store = await import("../../src/server/lib/modelDownloadStore");
    await store.initDownloadStore();
    const entry = await store.addDownload(
      "https://civitai.com/models/123?modelVersionId=456",
      "loras",
      "civitai",
      "ink.safetensors"
    );
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(
      String(url).includes("model-versions")
        ? { id: 456, modelId: 123, images: [{ url: "javascript:alert(1)" }] }
        : { modelVersions: [{ id: 456 }] }
    ), { status: 200, headers: { "Content-Type": "application/json" } })));
    const { refreshDownloadMetadata } = await import("../../src/server/lib/modelDownloader");

    const result = await refreshDownloadMetadata(entry.id, "secret");

    expect(result.ok && result.entry.previewUrl).toBeUndefined();
  });
});