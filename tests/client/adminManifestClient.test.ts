import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteServerImage,
  fetchAdminManifest,
  imageCacheKey,
  parseImageCacheKey,
  recacheImageFromServer
} from "../../src/client/lib/api/adminManifestClient";
import { getImage } from "../../src/client/lib/imageCache";
import type { JobManifestEntry } from "../../src/shared/contracts/jobs";

const originalFetch = global.fetch;

describe("adminManifestClient", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("fetchAdminManifest", () => {
    it("parses { ok, jobs } and returns the jobs array", async () => {
      const jobs: JobManifestEntry[] = [
        {
          jobId: "job1",
          displayName: "a3f2c1b0",
          endpointId: "ep1",
          workflowFileName: null,
          submittedAt: "2026-06-20T00:00:00.000Z",
          completedAt: null,
          expiresAt: null,
          status: "COMPLETED",
          isTerminal: true,
          imageCount: 1,
          images: []
        }
      ];
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, jobs })
      } as Response);

      const result = await fetchAdminManifest();

      expect(global.fetch).toHaveBeenCalledWith("/api/admin/manifest", { credentials: "include" });
      expect(result).toEqual(jobs);
    });

    it("throws when res.ok is false", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500
      } as Response);

      await expect(fetchAdminManifest()).rejects.toThrow(/Failed to fetch admin manifest/);
    });
  });

  describe("deleteServerImage", () => {
    it("calls fetch with DELETE against the image endpoint", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true } as Response);

      await deleteServerImage("job1", 0);

      expect(global.fetch).toHaveBeenCalledWith("/api/admin/jobs/job1/images/0", {
        method: "DELETE",
        credentials: "include"
      });
    });

    it("throws when deletion fails", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 404 } as Response);

      await expect(deleteServerImage("job1", 0)).rejects.toThrow(/Failed to delete server image/);
    });
  });

  describe("cache key helpers", () => {
    it("parses and round-trips a cache key", () => {
      expect(parseImageCacheKey("/api/jobs/job1/images/2")).toEqual({ jobId: "job1", index: 2 });

      const parsed = parseImageCacheKey("/api/jobs/job1/images/2");
      expect(parsed).not.toBeNull();
      expect(imageCacheKey(parsed!.jobId, parsed!.index)).toBe("/api/jobs/job1/images/2");
    });

    it("returns null for a non-matching key", () => {
      expect(parseImageCacheKey("/api/admin/manifest")).toBeNull();
    });
  });

  describe("recacheImageFromServer", () => {
    it("fetches the server image and stores it in IndexedDB", async () => {
      const blob = new Blob(["x"], { type: "image/png" });
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        blob: async () => blob
      } as unknown as Response);

      await recacheImageFromServer("job1", 0);

      expect(global.fetch).toHaveBeenCalledWith("/api/jobs/job1/images/0", { credentials: "include" });
      const cached = await getImage("/api/jobs/job1/images/0");
      expect(cached).not.toBeNull();
      expect(cached?.dataUrl).toContain("data:");
      expect(cached?.mimeType).toBe("image/png");
    });
  });
});
