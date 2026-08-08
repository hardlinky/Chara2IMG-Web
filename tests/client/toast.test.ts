import { afterEach, describe, expect, it, vi } from "vitest";
import { showErrorToast } from "../../src/client/lib/toast";

describe("error toast", () => {
  afterEach(() => {
    document.getElementById("toast-container")?.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows submission proxy failures as red toasts", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);

    showErrorToast(new Error("Proxy request failed (429) Wallet job capacity reached"), "Run submission failed.");

    const toast = document.querySelector<HTMLElement>(".toast");
    expect(toast?.dataset.tone).toBe("error");
    expect(toast?.textContent).toBe("Proxy request failed (429) Wallet job capacity reached");
  });
});