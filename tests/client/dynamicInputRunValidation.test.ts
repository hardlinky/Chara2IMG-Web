import { describe, expect, it } from "vitest";
import type { DynamicInputControl } from "../../src/shared/contracts/inputs";
import { attemptRunFromEditorState, dynamicInputValueEquals } from "../../src/client/features/inputs/useDynamicInputEditor";

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
  it("compares image and structured values without JSON serialization", () => {
    const imageData = `data:image/png;base64,${"a".repeat(100_000)}`;

    expect(dynamicInputValueEquals({ dataUrl: imageData }, { dataUrl: imageData })).toBe(true);
    expect(dynamicInputValueEquals({ dataUrl: imageData }, { dataUrl: `${imageData}b` })).toBe(false);
    expect(dynamicInputValueEquals({ width: 1024, height: 1024 }, { width: 1024, height: 1024 })).toBe(true);
    expect(dynamicInputValueEquals(
      { loras: [{ loraName: "style.safetensors", strength: 0.8 }] },
      { loras: [{ loraName: "style.safetensors", strength: 0.8 }] }
    )).toBe(true);
  });

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

  it("blocks a workflow whose checkpoint is None", () => {
    const checkpoint = createControl({
      id: "24:checkpoint:ckpt_name",
      kind: "checkpoint",
      name: "Checkpoint",
      source: {
        nodeId: "24",
        titlePath: "24._meta.title",
        valuePath: ["ckpt_name"]
      },
      defaultValue: "None"
    });

    const result = attemptRunFromEditorState({
      controls: [checkpoint],
      draftValues: {},
      templateRawJson: {
        "24": {
          class_type: "Checkpoint Loader with Name (Image Saver)",
          inputs: { ckpt_name: "None" }
        }
      }
    });

    expect(result.ok).toBe(false);
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