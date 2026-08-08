import { describe, expect, it } from "vitest";
import type { DynamicInputControl } from "../../src/shared/contracts/inputs";
import { formatTrackedControlValues } from "../../src/client/features/outputs/TrackedInputsPanel";

function control(overrides: Partial<DynamicInputControl>): DynamicInputControl {
  return {
    id: "model",
    kind: "checkpoint",
    inputIndex: 1,
    fullTitle: "[Input1] Models.Checkpoint",
    category: "Models",
    name: "Checkpoint",
    source: { nodeId: "24", titlePath: "24.inputs.title", valuePath: ["ckpt_name"] },
    constraints: {},
    defaultValue: null,
    orderKey: "000001:model",
    ...overrides
  };
}

describe("tracked model inputs", () => {
  it("formats checkpoint and every enabled LoRA", () => {
    expect(formatTrackedControlValues(control({
      kind: "checkpoint",
      defaultValue: "waiIllustriousSDXL_v160.safetensors"
    }))).toEqual([{ label: "Checkpoint", value: "waiIllustriousSDXL_v160" }]);

    expect(formatTrackedControlValues(control({
      kind: "lora-list",
      name: "Loras",
      defaultValue: {
        loras: [
          { loraName: "style-a.safetensors", strength: 0.8 },
          { loraName: "style-b.safetensors", strength: 1 }
        ]
      }
    }))).toEqual([
      { label: "style-a", value: "0.8" },
      { label: "style-b", value: "1" }
    ]);
  });
});