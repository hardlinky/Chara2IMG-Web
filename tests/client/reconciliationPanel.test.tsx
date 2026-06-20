// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { JobImageRecord, JobManifestEntry } from "../../src/shared/contracts/jobs";
import { ReconciliationPanel } from "../../src/client/features/access/ReconciliationPanel";
import {
  deleteServerImage,
  fetchAdminManifest,
  recacheImageFromServer
} from "../../src/client/lib/api/adminManifestClient";
import { deleteImage, listCachedImages } from "../../src/client/lib/imageCache";

vi.mock("../../src/client/lib/api/adminManifestClient", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/lib/api/adminManifestClient")>(
    "../../src/client/lib/api/adminManifestClient"
  );
  return {
    ...actual,
    fetchAdminManifest: vi.fn(),
    deleteServerImage: vi.fn(),
    recacheImageFromServer: vi.fn()
  };
});

vi.mock("../../src/client/lib/imageCache", () => ({
  listCachedImages: vi.fn(),
  deleteImage: vi.fn()
}));

function image(jobId: string, imageIndex: number, overrides: Partial<JobImageRecord> = {}): JobImageRecord {
  return {
    jobId,
    imageIndex,
    fileName: `a3f2c1b0-${imageIndex}.png`,
    relPath: `${jobId}/a3f2c1b0-${imageIndex}.png`,
    mimeType: "image/png",
    sizeBytes: 1024,
    isPinned: false,
    isArchived: false,
    archivedAt: null,
    unarchiveExpiresAt: null,
    ...overrides
  };
}

function manifestEntry(images: JobImageRecord[]): JobManifestEntry {
  return {
    jobId: "jobA",
    displayName: "a3f2c1b0",
    endpointId: "ep1",
    workflowFileName: null,
    submittedAt: "2026-06-20T00:00:00.000Z",
    completedAt: null,
    expiresAt: null,
    status: "COMPLETED",
    isTerminal: true,
    imageCount: images.length,
    images
  };
}

const fetchAdminManifestMock = vi.mocked(fetchAdminManifest);
const deleteServerImageMock = vi.mocked(deleteServerImage);
const recacheImageFromServerMock = vi.mocked(recacheImageFromServer);
const listCachedImagesMock = vi.mocked(listCachedImages);
const deleteImageMock = vi.mocked(deleteImage);

describe("ReconciliationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jobA:0 matched (server + fresh client cache), jobA:1 server-only (mismatch).
    fetchAdminManifestMock.mockResolvedValue([manifestEntry([image("jobA", 0), image("jobA", 1)])]);
    listCachedImagesMock.mockResolvedValue([
      { cacheKey: "/api/jobs/jobA/images/0", expiresAt: Date.now() + 60 * 60 * 1000 }
    ]);
    deleteServerImageMock.mockResolvedValue(undefined);
    recacheImageFromServerMock.mockResolvedValue(undefined);
    deleteImageMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders both columns and highlights the server-only mismatch row", async () => {
    render(<ReconciliationPanel />);

    expect(await screen.findByText("Server manifest")).toBeTruthy();
    expect(screen.getByText("Client cache")).toBeTruthy();

    const mismatchRows = document.querySelectorAll(".reconcile-row--mismatch");
    expect(mismatchRows.length).toBe(1);
    expect(mismatchRows[0]?.textContent).toContain("#1");
  });

  it("filters to mismatches only when the toggle is enabled", async () => {
    render(<ReconciliationPanel />);
    await screen.findByText("Server manifest");

    fireEvent.click(screen.getByLabelText("Mismatches only"));

    await waitFor(() => {
      const rows = document.querySelectorAll(".reconcile-row");
      expect(rows.length).toBe(1);
    });
    expect(document.querySelector(".reconcile-row")?.textContent).toContain("#1");
  });

  it("deletes a server image and drops the row", async () => {
    render(<ReconciliationPanel />);
    await screen.findByText("Server manifest");

    fireEvent.click(screen.getByLabelText("Mismatches only"));
    await waitFor(() => expect(document.querySelectorAll(".reconcile-row").length).toBe(1));

    const row = document.querySelector(".reconcile-row") as HTMLElement;
    fireEvent.click(within(row).getByText("Delete"));

    await waitFor(() => expect(deleteServerImageMock).toHaveBeenCalledWith("jobA", 1));
    await waitFor(() => expect(document.querySelectorAll(".reconcile-row").length).toBe(0));
  });

  it("evicts a client image via deleteImage", async () => {
    render(<ReconciliationPanel />);
    await screen.findByText("Server manifest");

    fireEvent.click(screen.getByText("Evict"));

    await waitFor(() => expect(deleteImageMock).toHaveBeenCalledWith("/api/jobs/jobA/images/0"));
  });

  it("copies a server image to the client cache via recacheImageFromServer", async () => {
    render(<ReconciliationPanel />);
    await screen.findByText("Server manifest");

    fireEvent.click(screen.getByLabelText("Mismatches only"));
    await waitFor(() => expect(document.querySelectorAll(".reconcile-row").length).toBe(1));

    const row = document.querySelector(".reconcile-row") as HTMLElement;
    fireEvent.click(within(row).getByText("Copy →"));

    await waitFor(() => expect(recacheImageFromServerMock).toHaveBeenCalledWith("jobA", 1));
    // Copy triggers an extra refresh (initial mount + after copy).
    await waitFor(() => expect(fetchAdminManifestMock).toHaveBeenCalledTimes(2));
  });

  it("disables a row's action button while its request is in flight", async () => {
    let resolveDelete: (() => void) | null = null;
    deleteServerImageMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        })
    );

    render(<ReconciliationPanel />);
    await screen.findByText("Server manifest");

    fireEvent.click(screen.getByLabelText("Mismatches only"));
    await waitFor(() => expect(document.querySelectorAll(".reconcile-row").length).toBe(1));

    const row = document.querySelector(".reconcile-row") as HTMLElement;
    const deleteButton = within(row).getByText("Delete") as HTMLButtonElement;
    fireEvent.click(deleteButton);

    await waitFor(() => expect(deleteButton.disabled).toBe(true));

    (resolveDelete as (() => void) | null)?.();
    await waitFor(() => expect(document.querySelectorAll(".reconcile-row").length).toBe(0));
  });
});
