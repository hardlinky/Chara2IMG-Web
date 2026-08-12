import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DownloadEntry } from "../../src/shared/contracts/modelDownloads";

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "model-downloads-"));
  process.env.NETWORK_MODELS_ROOT = tmpRoot;
  const mod = await import("../../src/server/lib/modelDownloader");
  await mod.ensureModelDownloadPaths();
});

afterEach(async () => {
  delete process.env.NETWORK_MODELS_ROOT;
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("model download file handling", () => {
  it("writes metadata next to the model file", async () => {
    const { writeDownloadMetadata } = await import("../../src/server/lib/modelDownloader");
    const filePath = join(tmpRoot, "checkpoints", "example.safetensors");
    await mkdir(join(tmpRoot, "checkpoints"), { recursive: true });
    await writeFile(filePath, "model-bytes", "utf8");

    const entry: DownloadEntry = {
      id: "dl-1",
      source: "civitai",
      url: "https://civitai.com/models/123",
      destPath: "checkpoints",
      filename: "example.safetensors",
      status: "finished",
      bytesDownloaded: 12,
      totalBytes: 12,
      createdAt: "2026-08-12T00:00:00.000Z",
      completedAt: "2026-08-12T00:00:01.000Z",
      error: null,
    };

    await writeDownloadMetadata(entry, filePath);

    const metadata = JSON.parse(await (await import("node:fs/promises")).readFile(`${filePath}.json`, "utf8")) as { filename: string; source: string };
    expect(metadata.filename).toBe("example.safetensors");
    expect(metadata.source).toBe("civitai");
  });

  it("removes the model file and sidecar metadata when requested", async () => {
    const { removeDownloadFiles } = await import("../../src/server/lib/modelDownloader");
    const modelPath = join(tmpRoot, "checkpoints", "example.safetensors");
    const metadataPath = `${modelPath}.json`;
    await mkdir(join(tmpRoot, "checkpoints"), { recursive: true });
    await writeFile(modelPath, "model-bytes", "utf8");
    await writeFile(metadataPath, JSON.stringify({ ok: true }), "utf8");

    const entry: DownloadEntry = {
      id: "dl-2",
      source: "huggingface",
      url: "https://huggingface.co/example",
      destPath: "checkpoints",
      filename: "example.safetensors",
      status: "finished",
      bytesDownloaded: 12,
      totalBytes: 12,
      createdAt: "2026-08-12T00:00:00.000Z",
      completedAt: "2026-08-12T00:00:01.000Z",
      error: null,
    };

    await removeDownloadFiles(entry);

    await expect((await import("node:fs/promises")).access(modelPath).catch(() => false)).resolves.toBe(false);
    await expect((await import("node:fs/promises")).access(metadataPath).catch(() => false)).resolves.toBe(false);
  });
});
