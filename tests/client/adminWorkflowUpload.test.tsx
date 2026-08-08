import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadWorkflowTemplate } from "../../src/client/lib/api/adminWorkflowsClient";
import { WorkflowUploadsPanel } from "../../src/client/features/access/WorkflowUploadsPanel";

vi.mock("../../src/client/lib/api/adminWorkflowsClient", () => ({
  uploadWorkflowTemplate: vi.fn()
}));

describe("WorkflowUploadsPanel", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("validates and uploads the selected workflow", async () => {
    vi.mocked(uploadWorkflowTemplate).mockResolvedValue({ ok: true, filename: "portrait.json" });
    const file = new File([
      JSON.stringify({ "1": { class_type: "KSampler", inputs: { seed: 1 } } })
    ], "portrait.json", { type: "application/json" });
    Object.defineProperty(file, "text", {
      value: async () => JSON.stringify({ "1": { class_type: "KSampler", inputs: { seed: 1 } } })
    });
    render(<WorkflowUploadsPanel />);

    fireEvent.change(screen.getByLabelText("Workflow JSON"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText("Ready: portrait.json")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Upload template" }));

    await waitFor(() => expect(uploadWorkflowTemplate).toHaveBeenCalledWith(
      "portrait.json",
      { "1": { class_type: "KSampler", inputs: { seed: 1 } } },
      false
    ));
    expect(await screen.findByText('Uploaded "portrait.json".')).toBeTruthy();
  });

  it("blocks invalid workflow content before upload", async () => {
    const file = new File([JSON.stringify({ unexpected: true })], "invalid.json", { type: "application/json" });
    Object.defineProperty(file, "text", {
      value: async () => JSON.stringify({ unexpected: true })
    });
    render(<WorkflowUploadsPanel />);

    fireEvent.change(screen.getByLabelText("Workflow JSON"), { target: { files: [file] } });

    expect(await screen.findByText(/expected object/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload template" }).hasAttribute("disabled")).toBe(true);
    expect(uploadWorkflowTemplate).not.toHaveBeenCalled();
  });
});