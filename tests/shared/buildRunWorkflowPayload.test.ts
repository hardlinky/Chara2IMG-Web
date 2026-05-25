import { describe, expect, it } from "vitest";
import type { DynamicInputControl } from "../../src/shared/contracts/inputs";
import { buildRunWorkflowPayload } from "../../src/shared/workflow/buildRunWorkflowPayload";

function createControl(overrides: Partial<DynamicInputControl>): DynamicInputControl {
  return {
    id: "a:text:value",
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

describe("buildRunWorkflowPayload", () => {
  it("applies edited values to a fresh cloned payload", () => {
    const template = {
      "10": {
        class_type: "Prompt",
        inputs: {
          value: "base"
        }
      },
      "11": {
        class_type: "Sampler",
        inputs: {
          steps: 20
        }
      }
    };

    const controls = [
      createControl({ id: "10:text:value", source: { nodeId: "10", titlePath: "10.inputs.title", valuePath: ["value"] } }),
      createControl({
        id: "11:number:steps",
        kind: "number",
        name: "Steps",
        source: {
          nodeId: "11",
          titlePath: "11.inputs.title",
          valuePath: ["steps"]
        },
        defaultValue: 20
      })
    ];

    const result = buildRunWorkflowPayload({
      templateRawJson: template,
      controls,
      draftValues: {
        "10:text:value": "updated",
        "11:number:steps": 35
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect((result.payload["10"] as { inputs: { value: string } }).inputs.value).toBe("updated");
    expect((result.payload["11"] as { inputs: { steps: number } }).inputs.steps).toBe(35);
  });

  it("fails all-or-nothing when a mapped target is missing", () => {
    const template = {
      "10": {
        class_type: "Prompt",
        inputs: {
          value: "base"
        }
      }
    };

    const controls = [
      createControl({
        id: "missing:text:value",
        source: {
          nodeId: "404",
          titlePath: "404.inputs.title",
          valuePath: ["value"]
        }
      })
    ];

    const result = buildRunWorkflowPayload({
      templateRawJson: template,
      controls,
      draftValues: {
        "missing:text:value": "ignored"
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.errors[0]?.message).toContain("missing workflow node");
  });

  it("does not mutate the canonical template during write-back", () => {
    const template = {
      "10": {
        class_type: "Prompt",
        inputs: {
          value: "base"
        }
      }
    };

    const result = buildRunWorkflowPayload({
      templateRawJson: template,
      controls: [
        createControl({
          id: "10:text:value",
          source: {
            nodeId: "10",
            titlePath: "10.inputs.title",
            valuePath: ["value"]
          }
        })
      ],
      draftValues: {
        "10:text:value": "changed"
      }
    });

    expect(result.ok).toBe(true);
    expect((template["10"] as { inputs: { value: string } }).inputs.value).toBe("base");
  });

  it("produces deterministic payload for the same template and draft", () => {
    const template = {
      "10": {
        class_type: "Prompt",
        inputs: {
          value: "base"
        }
      }
    };

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

    const first = buildRunWorkflowPayload({
      templateRawJson: template,
      controls,
      draftValues: {
        "10:text:value": "same"
      }
    });
    const second = buildRunWorkflowPayload({
      templateRawJson: template,
      controls,
      draftValues: {
        "10:text:value": "same"
      }
    });

    expect(first).toEqual(second);
  });

  it("applies lora-row controls to lora on/strength fields", () => {
    const template = {
      "534": {
        class_type: "Power Lora Loader (rgthree)",
        inputs: {
          lora_1: {
            on: true,
            lora: "Houtengeki_Style.safetensors",
            strength: 1
          }
        }
      }
    };

    const result = buildRunWorkflowPayload({
      templateRawJson: template,
      controls: [
        createControl({
          id: "534:lora-row:lora_1",
          kind: "lora-row",
          name: "Houtengeki_Style.safetensors",
          source: {
            nodeId: "534",
            titlePath: "534._meta.title",
            valuePath: ["lora_1"]
          },
          constraints: {
            min: -5,
            max: 5,
            precision: 3
          },
          defaultValue: {
            enabled: true,
            loraName: "Houtengeki_Style.safetensors",
            strength: 1
          }
        })
      ],
      draftValues: {
        "534:lora-row:lora_1": {
          enabled: false,
          loraName: "Houtengeki_Style.safetensors",
          strength: -2.25
        }
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const loraRow = (result.payload["534"] as { inputs: { lora_1: { on: boolean; strength: number } } }).inputs.lora_1;
    expect(loraRow.on).toBe(false);
    expect(loraRow.strength).toBe(-2.25);
  });

  it("strips data URL prefix and normalizes base64 padding for easy loadImageBase64 inputs", () => {
    const template = {
      "863": {
        class_type: "easy loadImageBase64",
        inputs: {
          base64_data: ""
        }
      }
    };

    const result = buildRunWorkflowPayload({
      templateRawJson: template,
      controls: [
        createControl({
          id: "863:image:base64_data",
          kind: "image",
          name: "Base64 image",
          source: {
            nodeId: "863",
            titlePath: "863._meta.title",
            valuePath: ["base64_data"]
          },
          defaultValue: null
        })
      ],
      draftValues: {
        "863:image:base64_data": {
          dataUrl: "data:image/png;base64,YWJjZA"
        }
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const base64Data = (result.payload["863"] as { inputs: { base64_data: string } }).inputs.base64_data;
    expect(base64Data).toBe("YWJjZA==");
  });
});