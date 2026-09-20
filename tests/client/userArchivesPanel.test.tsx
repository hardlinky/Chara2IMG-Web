import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { UserArchivesPanel } from "../../src/client/features/access/UserArchivesPanel";
import { ANONYMOUS_ARCHIVE_OWNER, type UserArchiveSummary } from "../../src/shared/contracts/archives";

const originalFetch = global.fetch;

function summary(overrides: Partial<UserArchiveSummary>): UserArchiveSummary {
  return {
    username: "alice",
    jobCount: 0,
    imageCount: 0,
    imageBytes: 0,
    metadataBytes: 0,
    totalBytes: 0,
    ...overrides
  };
}

describe("UserArchivesPanel", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        users: [
          summary({ username: "alice", jobCount: 2, imageCount: 3, imageBytes: 2048, metadataBytes: 1024, totalBytes: 3072 }),
          summary({ username: ANONYMOUS_ARCHIVE_OWNER, jobCount: 1, imageCount: 1, imageBytes: 512, metadataBytes: 512, totalBytes: 1024 }),
          summary({ username: "bob" })
        ]
      })
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("lists usage per user, with a download link only for users that have data", async () => {
    render(<UserArchivesPanel />);

    await waitFor(() => {
      expect(screen.getByText("alice")).toBeTruthy();
    });

    expect(screen.getByText("Anonymous (no account)")).toBeTruthy();
    expect(screen.getByText("3.00 KB")).toBeTruthy();
    expect(screen.getByText("Nothing stored")).toBeTruthy();

    const downloadLinks = screen.getAllByRole("link", { name: /download \.zip/i }) as HTMLAnchorElement[];
    expect(downloadLinks).toHaveLength(2);
    expect(downloadLinks[0]!.getAttribute("href")).toBe("/api/admin/archives/alice/download");
    expect(downloadLinks[1]!.getAttribute("href")).toBe("/api/admin/archives/__anonymous__/download");
  });

  it("surfaces a load failure", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 403 })) as unknown as typeof fetch;

    render(<UserArchivesPanel />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load archive usage: 403/i)).toBeTruthy();
    });
  });
});
