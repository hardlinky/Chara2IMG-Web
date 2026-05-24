import { describe, expect, it } from "vitest";
import type { DynamicInputControl } from "../../src/shared/contracts/inputs";
import { attemptRunFromEditorState } from "../../src/client/features/inputs/useDynamicInputEditor";

function createControl(overrides: Partial<DynamicInputControl>): DynamicInputControl {
  return {
    id: "10:text:value",
    kind: "text",
    inputIndex: 1,
    fullTitle: "[Input1] Character.Prompt",
    category: "Character",
    name: "Prompt",
    source: {
      nodeId: "10",
      titlePath: "10.inputs.title",
      valuePath: ["value"]
    },
    constraints: {},
    defaultValue: "base",
    orderKey: "000001:[Input1] Character.Prompt",
    ...overrides
  };
}

describe("dynamic input run validation", () => {
  it("blocks run when invalid required fields remain", () => {
    const controls = [
      createControl({
        id: "img:image:value",
        kind: "image",
        name: "Reference",
        source: {
          nodeId: "10",
          titlePath: "10.inputs.title",
          valuePath: ["value"]
        },
        constraints: { required: true },
        defaultValue: null
      })
    ];

    const result = attemptRunFromEditorState({
      controls,
      draftValues: {
        "img:image:value": null
      },
      templateRawJson: {
        "10": {
          class_type: "Loader",
          inputs: { value: "" }
        }
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.blockingMessage).toContain("Fix highlighted inputs");
  });

  it("preserves drafts and builds payload on valid run", () => {
    const controls = [
      createControl({
        id: "10:text:value",
        source: {
          nodeId: "10",
          titlePath: "10.inputs.title",
          valuePath: ["value"]
        }
      })
    ];

    const draftValues = {
      "10:text:value": "updated"
    };

    const result = attemptRunFromEditorState({
      controls,
      draftValues,
      templateRawJson: {
        "10": {
          class_type: "Prompt",
          inputs: { value: "base" }
        }
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect((result.payload["10"] as { inputs: { value: string } }).inputs.value).toBe("updated");
    expect(draftValues["10:text:value"]).toBe("updated");
  });

  it("reports write-back errors as blocking failures", () => {
    const controls = [
      createControl({
        id: "404:text:value",
        source: {
          nodeId: "404",
          titlePath: "404.inputs.title",
          valuePath: ["value"]
        }
      })
    ];

    const result = attemptRunFromEditorState({
      controls,
      draftValues: {
        "404:text:value": "hello"
      },
      templateRawJson: {
        "10": {
          class_type: "Prompt",
          inputs: { value: "base" }
        }
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.errors[0]?.message).toContain("missing workflow node");
  });
});