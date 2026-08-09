import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCivitaiTriggerWords } from "../../src/server/lib/modelDownloader";

describe("CivitAI trigger words", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads and normalizes trained words for a model version URL", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      trainedWords: [" ink style ", "bold lines", "ink style", ""]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCivitaiTriggerWords(
      "https://civitai.com/models/123?modelVersionId=456",
      "secret"
    )).resolves.toEqual(["ink style", "bold lines"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://civitai.com/api/v1/model-versions/456",
      expect.objectContaining({ headers: { Authorization: "Bearer secret" } })
    );
  });

  it("uses the newest model version when the page URL has no version ID", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      modelVersions: [{ trainedWords: ["portrait style"] }]
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(fetchCivitaiTriggerWords("https://civitai.com/models/123", "secret"))
      .resolves.toEqual(["portrait style"]);
  });
});