import { describe, expect, it } from "vitest";
import { isActiveRunpodStatus, isTerminalRunpodStatus, toTerminalReason } from "../../src/shared/contracts/jobs";

describe("job contracts", () => {
  it("classifies terminal and active Runpod statuses", () => {
    expect(isTerminalRunpodStatus("COMPLETED")).toBe(true);
    expect(isTerminalRunpodStatus("IN_PROGRESS")).toBe(false);
    expect(isActiveRunpodStatus("IN_QUEUE")).toBe(true);
    expect(isActiveRunpodStatus("FAILED")).toBe(false);
  });

  it("maps terminal statuses to terminal reasons", () => {
    expect(toTerminalReason("COMPLETED")).toBe("completed");
    expect(toTerminalReason("FAILED")).toBe("failed");
    expect(toTerminalReason("CANCELLED")).toBe("cancelled");
    expect(toTerminalReason("TIMED_OUT")).toBe("timed-out");
  });
});