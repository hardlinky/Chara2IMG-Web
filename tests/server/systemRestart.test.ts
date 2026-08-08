import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SELF_UPDATE_RESTART_EXIT_CODE,
  scheduleSelfUpdateRestart
} from "../../src/server/routes/system";

describe("self-update restart", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("exits with the supervisor restart code after allowing the response to flush", () => {
    vi.useFakeTimers();
    const exit = vi.fn() as unknown as (code: number) => never;

    scheduleSelfUpdateRestart(exit);
    expect(exit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    expect(exit).toHaveBeenCalledWith(SELF_UPDATE_RESTART_EXIT_CODE);
  });
});