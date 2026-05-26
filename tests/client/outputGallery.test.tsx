import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OutputsTab } from "../../src/client/features/outputs/OutputsTab";
import type { RecentJobOutputCluster } from "../../src/shared/contracts/jobs";

const tinyPngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WvJwAAAAASUVORK5CYII=";

function createCluster(overrides: Partial<RecentJobOutputCluster>): RecentJobOutputCluster {
  return {
    jobId: "job-1",
    endpointId: "endpoint-1",
    submittedAt: "2026-05-24T10:00:00.000Z",
    finishedAt: "2026-05-24T10:02:00.000Z",
    workflowFileName: "workflow-a.json",
    outputCount: 2,
    representative: {
      dataUrl: tinyPngDataUrl,
      mimeType: "image/png",
      sourcePath: "$.output.images[0].image",
      outputIndex: 0
    },
    outputs: [
      {
        dataUrl: tinyPngDataUrl,
        mimeType: "image/png",
        sourcePath: "$.output.images[0].image",
        outputIndex: 0
      },
      {
        dataUrl: tinyPngDataUrl,
        mimeType: "image/png",
        sourcePath: "$.output.images[1].image",
        outputIndex: 1
      }
    ],
    ...overrides
  };
}

describe("OutputsTab", () => {
  it("renders outputs tab shell with density control and collapsed cards", () => {
    const html = renderToStaticMarkup(
      <OutputsTab
        clusters={[createCluster({ jobId: "job-123" })]}
        onRerun={() => undefined}
        onLoadInputs={() => undefined}
        onRemoveJobOutputs={() => undefined}
        onRemoveOutputImage={() => undefined}
      />
    );

    expect(html).toContain("Outputs");
    expect(html).toContain("Density");
    expect(html).toContain("job-123");
    expect(html).toContain("2 images");
    expect(html).not.toContain("View job outputs");
    expect(html).toContain("Remove outputs");
  });

  it("renders empty state when there are no completed output clusters", () => {
    const html = renderToStaticMarkup(
      <OutputsTab
        clusters={[]}
        onRerun={() => undefined}
        onLoadInputs={() => undefined}
        onRemoveJobOutputs={() => undefined}
        onRemoveOutputImage={() => undefined}
      />
    );

    expect(html).toContain("No completed job outputs yet.");
  });
});
