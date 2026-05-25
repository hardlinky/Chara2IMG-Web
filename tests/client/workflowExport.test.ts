import { describe, expect, it } from "vitest";
import { sanitizeWorkflowForExport } from "../../src/client/lib/workflowExport";

describe("sanitizeWorkflowForExport", () => {
  it("clears base64_data image payloads", () => {
    const workflow = {
      "863": {
        class_type: "easy loadImageBase64",
        inputs: {
          base64_data: "data:image/png;base64,abcdef",
          keep: "hello"
        }
      }
    } satisfies Record<string, unknown>;

    const sanitized = sanitizeWorkflowForExport(workflow);
    const nodeInputs = (sanitized["863"] as { inputs: { base64_data: string; keep: string } }).inputs;

    expect(nodeInputs.base64_data).toBe("");
    expect(nodeInputs.keep).toBe("hello");
  });

  it("does not mutate the original workflow", () => {
    const workflow = {
      "863": {
        class_type: "easy loadImageBase64",
        inputs: {
          base64_data: "data:image/png;base64,abcdef"
        }
      }
    } satisfies Record<string, unknown>;

    const sanitized = sanitizeWorkflowForExport(workflow);

    expect(((workflow["863"] as { inputs: { base64_data: string } }).inputs.base64_data)).toBe("data:image/png;base64,abcdef");
    expect(((sanitized["863"] as { inputs: { base64_data: string } }).inputs.base64_data)).toBe("");
  });

  it("clears plain base64_data values even without a data URL prefix", () => {
    const workflow = {
      "863": {
        class_type: "easy loadImageBase64",
        inputs: {
          base64_data: "YWJjZA=="
        }
      }
    } satisfies Record<string, unknown>;

    const sanitized = sanitizeWorkflowForExport(workflow);
    const base64Data = (sanitized["863"] as { inputs: { base64_data: string } }).inputs.base64_data;

    expect(base64Data).toBe("");
  });
});
