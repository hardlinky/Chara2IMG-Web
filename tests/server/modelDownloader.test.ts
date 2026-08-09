import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCivitaiMetadata } from "../../src/server/lib/modelDownloader";

describe("CivitAI trigger words", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads and normalizes trained words for a model version URL", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(
      String(url).includes("model-versions")
        ? { id: 456, modelId: 123, trainedWords: [" ink style ", "bold lines", "ink style", ""] }
        : { modelVersions: [{ id: 789 }, { id: 456 }] }
    ), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCivitaiMetadata(
      "https://civitai.com/models/123?modelVersionId=456",
      "secret"
    )).resolves.toEqual({
      triggerWords: ["ink style", "bold lines"],
      modelId: 123,
      selectedVersionId: 456,
      latestVersionId: 789
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://civitai.com/api/v1/model-versions/456",
      expect.objectContaining({ headers: { Authorization: "Bearer secret" } })
    );
  });

  it("uses the newest model version when the page URL has no version ID", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      modelVersions: [{ id: 789, trainedWords: ["portrait style"] }]
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(fetchCivitaiMetadata("https://civitai.com/models/123", "secret"))
      .resolves.toEqual({
        triggerWords: ["portrait style"],
        modelId: 123,
        selectedVersionId: 789,
        latestVersionId: 789
      });
  });
});