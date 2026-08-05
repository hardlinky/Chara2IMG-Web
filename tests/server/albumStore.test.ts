import { describe, expect, it } from "vitest";
import type { Album } from "../../src/shared/contracts/albums";
import { filterAlbumsAgainstPresence } from "../../src/server/lib/albumStore";

function makeAlbum(id: string, images: Array<{ jobId: string; imageIndex: number }>): Album {
  const now = new Date().toISOString();
  return {
    id,
    name: `Album ${id}`,
    description: "",
    createdAt: now,
    updatedAt: now,
    createdBy: null,
    images: images.map((ref) => ({ ...ref, addedAt: now }))
  };
}

describe("filterAlbumsAgainstPresence", () => {
  it("keeps refs whose images are present", () => {
    const albums = [makeAlbum("a", [{ jobId: "job-1", imageIndex: 0 }])];
    const presence = new Map([["job-1", new Set([0])]]);
    const { albums: result, changed } = filterAlbumsAgainstPresence(albums, presence);
    expect(changed).toBe(false);
    expect(result).toHaveLength(1);
    expect(result[0]!.images).toHaveLength(1);
  });

  it("drops refs whose images are gone", () => {
    const albums = [
      makeAlbum("a", [
        { jobId: "job-1", imageIndex: 0 },
        { jobId: "job-1", imageIndex: 1 }
      ])
    ];
    const presence = new Map([["job-1", new Set([0])]]);
    const { albums: result, changed } = filterAlbumsAgainstPresence(albums, presence);
    expect(changed).toBe(true);
    expect(result[0]!.images).toEqual([expect.objectContaining({ jobId: "job-1", imageIndex: 0 })]);
  });

  it("removes albums left empty after pruning", () => {
    const albums = [
      makeAlbum("a", [{ jobId: "job-1", imageIndex: 0 }]),
      makeAlbum("b", [{ jobId: "job-2", imageIndex: 0 }])
    ];
    const presence = new Map([
      ["job-1", new Set<number>()],
      ["job-2", new Set([0])]
    ]);
    const { albums: result, changed } = filterAlbumsAgainstPresence(albums, presence);
    expect(changed).toBe(true);
    expect(result.map((album) => album.id)).toEqual(["b"]);
  });

  it("treats a missing job as all refs gone", () => {
    const albums = [makeAlbum("a", [{ jobId: "missing", imageIndex: 0 }])];
    const presence = new Map<string, Set<number>>();
    const { albums: result, changed } = filterAlbumsAgainstPresence(albums, presence);
    expect(changed).toBe(true);
    expect(result).toHaveLength(0);
  });
});
