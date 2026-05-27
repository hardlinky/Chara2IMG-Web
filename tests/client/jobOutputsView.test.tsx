import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JobOutputsView } from "../../src/client/features/outputs/JobOutputsView";
import type { RecentJobOutputCluster } from "../../src/shared/contracts/jobs";

const tinyPngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WvJwAAAAASUVORK5CYII=";

const cluster: RecentJobOutputCluster = {
  jobId: "job-1",
  isPinned: false,
  endpointId: "endpoint-1",
  submittedAt: "2026-05-24T10:00:00.000Z",
  finishedAt: "2026-05-24T10:02:00.000Z",
  workflowFileName: "workflow-a.json",
  outputCount: 2,
  representative: {
    dataUrl: tinyPngDataUrl,
    mimeType: "image/png",
    sourcePath: "$.output.images[0].image",
    outputIndex: 0,
    isPinned: false
  },
  outputs: [
    {
      dataUrl: tinyPngDataUrl,
      mimeType: "image/png",
      sourcePath: "$.output.images[0].image",
      outputIndex: 0,
      isPinned: false
    },
    {
      dataUrl: tinyPngDataUrl,
      mimeType: "image/png",
      sourcePath: "$.output.images[1].image",
      outputIndex: 1,
      isPinned: true
    }
  ]
};

describe("JobOutputsView", () => {
  it("renders previous and next job buttons in the navigation row and disables previous when unavailable", () => {
    const html = renderToStaticMarkup(
      <JobOutputsView
        cluster={cluster}
        onBack={() => undefined}
        onNextJob={() => undefined}
        onRerun={() => undefined}
        onLoadInputs={() => undefined}
        onRemoveImage={() => undefined}
        onRemoveAllOutputs={() => undefined}
      />
    );

    expect(html).toContain("outputs-job-navigation");
    expect(html).toContain(">Prev</button>");
    expect(html).toContain(">Next</button>");
    expect(html).toMatch(/<button class="btn btn-primary" type="button" disabled="">Prev<\/button>/);
  });

  it("renders remove all outputs button", () => {
    const html = renderToStaticMarkup(
      <JobOutputsView
        cluster={cluster}
        onBack={() => undefined}
        onRerun={() => undefined}
        onLoadInputs={() => undefined}
        onRemoveImage={() => undefined}
        onRemoveAllOutputs={() => undefined}
      />
    );

    expect(html).toContain("Remove all outputs");
  });

  it("renders pin icon button when pin handler is provided", () => {
    const html = renderToStaticMarkup(
      <JobOutputsView
        cluster={cluster}
        onBack={() => undefined}
        onRerun={() => undefined}
        onLoadInputs={() => undefined}
        onRemoveImage={() => undefined}
        onRemoveAllOutputs={() => undefined}
        onTogglePinnedImage={() => undefined}
      />
    );

    expect(html).toContain("📍");
    expect(html).toContain("outputs-image-pin-btn");
  });

  it("renders image-level icon actions for download, export workflow, and load inputs", () => {
    const html = renderToStaticMarkup(
      <JobOutputsView
        cluster={cluster}
        onBack={() => undefined}
        onRerun={() => undefined}
        onLoadInputs={() => undefined}
        onRemoveImage={() => undefined}
        onRemoveAllOutputs={() => undefined}
        onExportWorkflow={() => undefined}
      />
    );

    expect(html).toContain("outputs-image-bottom-actions");
    expect(html).toContain("Download job-1 image 1");
    expect(html).toContain("Export workflow for job-1");
    expect(html).toContain("Load inputs from job-1");
  });
});
