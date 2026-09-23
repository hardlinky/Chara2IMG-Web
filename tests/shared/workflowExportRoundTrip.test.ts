import { describe, expect, it } from "vitest";
import {
  buildRunWorkflowPayload,
  restoreUnresolvedWorkflowValues
} from "../../src/shared/workflow/buildRunWorkflowPayload";
import { deriveInputControls } from "../../src/shared/workflow/deriveInputControls";

const template = {
  "10": {
    class_type: "PrimitiveString",
    inputs: { value: "Sola" },
    _meta: { title: "[Input0] Character.Name" }
  },
  "11": {
    class_type: "PrimitiveStringMultiline",
    inputs: { value: "green eyes" },
    _meta: { title: "[Input2] Character.Eyes" }
  },
  "12": {
    class_type: "PrimitiveStringMultiline",
    inputs: { value: "" },
    _meta: { title: "[Input0] Prompt.Positive" }
  }
};

const draftValues = {
  "10:text:value": "Sola",
  "11:multiline:value": "green eyes",
  "12:multiline:value": "masterpiece, {Character.Eyes}"
};

function valueOf(payload: Record<string, unknown>, nodeId: string): string {
  return (payload[nodeId] as { inputs: { value: string } }).inputs.value;
}

describe("workflow export round trip", () => {
  it("resolves tokens when submitting a run", () => {
    const controls = deriveInputControls(template).controls;
    const result = buildRunWorkflowPayload({ templateRawJson: template, controls, draftValues });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(valueOf(result.payload, "12")).toBe("masterpiece, green eyes");
  });

  it("keeps tokens literal when resolution is disabled", () => {
    const controls = deriveInputControls(template).controls;
    const result = buildRunWorkflowPayload({
      templateRawJson: template,
      controls,
      draftValues,
      resolveTokens: false
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(valueOf(result.payload, "12")).toBe("masterpiece, {Character.Eyes}");
    expect(valueOf(result.payload, "11")).toBe("green eyes");
  });

  it("restores tokens over an already resolved payload", () => {
    const controls = deriveInputControls(template).controls;
    const submitted = buildRunWorkflowPayload({ templateRawJson: template, controls, draftValues });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;

    // Re-derive from the submitted payload the way the export path does.
    const restored = buildRunWorkflowPayload({
      templateRawJson: submitted.payload,
      controls: deriveInputControls(submitted.payload).controls,
      draftValues,
      resolveTokens: false
    });

    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(valueOf(restored.payload, "12")).toBe("masterpiece, {Character.Eyes}");
  });
});

describe("restoreUnresolvedWorkflowValues", () => {
  it("turns a submitted payload back into template form", () => {
    const controls = deriveInputControls(template).controls;
    const submitted = buildRunWorkflowPayload({ templateRawJson: template, controls, draftValues });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(valueOf(submitted.payload, "12")).toBe("masterpiece, green eyes");

    const stored = restoreUnresolvedWorkflowValues(submitted.payload, draftValues);
    expect(valueOf(stored, "12")).toBe("masterpiece, {Character.Eyes}");
  });

  it("is idempotent on an already unresolved payload", () => {
    const once = restoreUnresolvedWorkflowValues(template, draftValues);
    const twice = restoreUnresolvedWorkflowValues(once, draftValues);

    expect(valueOf(twice, "12")).toBe("masterpiece, {Character.Eyes}");
    expect(twice).toEqual(once);
  });

  it("returns the workflow untouched when no draft values exist", () => {
    expect(restoreUnresolvedWorkflowValues(template, {})).toBe(template);
    expect(restoreUnresolvedWorkflowValues(template, undefined)).toBe(template);
  });

  it("leaves controls missing from the draft at their submitted value", () => {
    const controls = deriveInputControls(template).controls;
    const submitted = buildRunWorkflowPayload({ templateRawJson: template, controls, draftValues });
    if (!submitted.ok) return;

    // Image drafts are stripped before reaching the server, so partial drafts must not wipe values.
    const stored = restoreUnresolvedWorkflowValues(submitted.payload, {
      "12:multiline:value": "masterpiece, {Character.Eyes}"
    });

    expect(valueOf(stored, "11")).toBe("green eyes");
    expect(valueOf(stored, "12")).toBe("masterpiece, {Character.Eyes}");
  });
});
