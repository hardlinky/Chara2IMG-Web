import { describe, expect, it } from "vitest";
import { isActiveRunpodStatus, isTerminalRunpodStatus, normalizeRunpodStatus, toTerminalReason } from "../../src/shared/contracts/jobs";

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

  it("normalizes known status aliases", () => {
    expect(normalizeRunpodStatus("queued")).toBe("IN_QUEUE");
    expect(normalizeRunpodStatus("PENDING")).toBe("IN_QUEUE");
    expect(normalizeRunpodStatus("running")).toBe("IN_PROGRESS");
    expect(normalizeRunpodStatus("processing")).toBe("IN_PROGRESS");
    expect(normalizeRunpodStatus("in progress")).toBe("IN_PROGRESS");
    expect(normalizeRunpodStatus("in   progress")).toBe("IN_PROGRESS");
    expect(normalizeRunpodStatus("canceled")).toBe("CANCELLED");
    expect(normalizeRunpodStatus("timeout")).toBe("TIMED_OUT");
    expect(normalizeRunpodStatus("timed out")).toBe("TIMED_OUT");
  });
});