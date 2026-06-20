import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/client/lib/imageCache", () => ({
  getImage: vi.fn().mockResolvedValue(null),
  storeImage: vi.fn(),
}));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});
import { formatOutputJobId } from "../../src/client/features/outputs/formatOutputJobId";
import { OutputsTab, resolveSelectedJobCluster } from "../../src/client/features/outputs/OutputsTab";
import type { RecentJobOutputCluster } from "../../src/shared/contracts/jobs";

const tinyPngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WvJwAAAAASUVORK5CYII=";

function createCluster(overrides: Partial<RecentJobOutputCluster>): RecentJobOutputCluster {
  return {
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
    ],
    ...overrides
  };
}

describe("OutputsTab", () => {
  it("prefers live job clusters over hydrated cache while in job view", () => {
    const liveCluster = createCluster({
      jobId: "job-1",
      outputs: [
        {
          dataUrl: tinyPngDataUrl,
          mimeType: "image/png",
          sourcePath: "$.output.images[0].image",
          outputIndex: 0,
          isPinned: true
        }
      ]
    });
    const hydratedCluster = createCluster({
      jobId: "job-1",
      outputs: [
        {
          dataUrl: tinyPngDataUrl,
          mimeType: "image/png",
          sourcePath: "$.output.images[0].image",
          outputIndex: 0,
          isPinned: false
        }
      ]
    });

    const resolved = resolveSelectedJobCluster("job-1", [liveCluster], { "job-1": hydratedCluster }, hydratedCluster);

    expect(resolved?.outputs[0]?.isPinned).toBe(true);
  });

  it("falls back to hydrated cache only when live cluster is unavailable", () => {
    const hydratedCluster = createCluster({
      jobId: "job-404",
      outputs: [
        {
          dataUrl: tinyPngDataUrl,
          mimeType: "image/png",
          sourcePath: "$.output.images[0].image",
          outputIndex: 0,
          isPinned: true
        }
      ]
    });

    const resolved = resolveSelectedJobCluster("job-404", [], { "job-404": hydratedCluster }, null);

    expect(resolved?.jobId).toBe("job-404");
    expect(resolved?.outputs[0]?.isPinned).toBe(true);
  });

  it("renders outputs tab shell with density control and collapsed cards", () => {
    const displayJobId = formatOutputJobId("job-123");
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
    expect(html).toContain("View");
    expect(html).toContain("Jobs");
    expect(html).toContain("Density");
    expect(html).toContain(`${displayJobId} #1`);
    expect(html).toContain("2 images");
    expect(html).toContain(`View job outputs for ${displayJobId}`);
    expect(html).toContain("Page 1 / 1");
    expect(html).not.toContain("Remove outputs");
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
