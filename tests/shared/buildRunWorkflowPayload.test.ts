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
});