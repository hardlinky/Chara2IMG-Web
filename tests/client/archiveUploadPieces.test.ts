import { describe, expect, it } from "vitest";
import { computePendingPieces } from "../../src/client/lib/api/archivesClient";

const CHUNK = 4 * 1024 * 1024;

describe("computePendingPieces", () => {
  it("cuts a fresh file into fixed-size pieces with a short final piece", () => {
    const pieces = computePendingPieces(CHUNK * 2 + 100, CHUNK, []);

    expect(pieces).toEqual([
      { offset: 0, length: CHUNK },
      { offset: CHUNK, length: CHUNK },
      { offset: CHUNK * 2, length: 100 }
    ]);
  });

  it("skips pieces the server already holds, whatever order they arrived in", () => {
    const pieces = computePendingPieces(CHUNK * 3, CHUNK, [
      [CHUNK * 2, CHUNK],
      [0, CHUNK]
    ]);

    expect(pieces).toEqual([{ offset: CHUNK, length: CHUNK }]);
  });

  it("re-sends a piece whose stored length does not match the grid", () => {
    const pieces = computePendingPieces(CHUNK * 2, CHUNK, [[0, CHUNK - 1]]);

    expect(pieces[0]).toEqual({ offset: 0, length: CHUNK });
  });

  it("returns nothing once every piece is present", () => {
    expect(computePendingPieces(CHUNK, CHUNK, [[0, CHUNK]])).toEqual([]);
  });
});
