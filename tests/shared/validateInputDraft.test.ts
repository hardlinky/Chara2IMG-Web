import { describe, expect, it } from "vitest";
import type { DynamicInputControl } from "../../src/shared/contracts/inputs";
import {
  shouldPersistDraftValue,
  validateDraftForRun,
  validateInlineControl
} from "../../src/shared/workflow/validateInputDraft";

function createControl(overrides: Partial<DynamicInputControl>): DynamicInputControl {
  return {
    id: "control",
    kind: "text",
    inputIndex: 1,
    fullTitle: "[Input1] Section.Name",
    category: "Section",
    name: "Name",
    source: {
      nodeId: "1",
      titlePath: "1.inputs.title",
      valuePath: ["value"]
    },
    constraints: {},
    defaultValue: "",
    orderKey: "000001:[Input1] Section.Name",
    ...overrides
  };
}

describe("validateInputDraft", () => {
  it("keeps inline validation non-blocking and clears errors once value becomes valid", () => {
    const numeric = createControl({
      id: "num",
      kind: "number",
      name: "Steps",
      constraints: { min: 1, max: 50, precision: 0 },
      defaultValue: 20
    });

    const invalid = validateInlineControl(numeric, 0);
    expect(invalid.valid).toBe(false);

    const cleared = validateInlineControl(numeric, 25);
    expect(cleared.valid).toBe(true);
    expect(cleared.errors).toEqual([]);
  });

  it("blocks run when required image is missing", () => {
    const image = createControl({
      id: "img",
      kind: "image",
      name: "Reference Image",
      constraints: { required: true },
      defaultValue: null
    });

    const runValidation = validateDraftForRun([image], {
      img: null
    });

    expect(runValidation.valid).toBe(false);
    expect(runValidation.blockingMessage).toContain("Fix highlighted inputs");
    expect(runValidation.errors[0]?.message).toContain("needs an image");
  });

  it("validates dimension pair completeness and precision constraints", () => {
    const dimension = createControl({
      id: "dim",
      kind: "dimension",
      name: "Canvas",
      constraints: { min: 64, precision: 0 },
      defaultValue: { width: 512, height: 512 }
    });

    const invalid = validateInlineControl(dimension, {
      width: 63,
      height: 256.5
    });
    expect(invalid.valid).toBe(false);

    const valid = validateInlineControl(dimension, {
      width: 768,
      height: 1024
    });
    expect(valid.valid).toBe(true);
  });

  it("persists text-like invalid values but rejects invalid structured values", () => {
    const text = createControl({ id: "txt", kind: "text", defaultValue: "" });
    const number = createControl({
      id: "num",
      kind: "number",
      name: "CFG",
      constraints: { min: 1 },
      defaultValue: 7
    });

    expect(shouldPersistDraftValue(text, "")).toBe(true);
    expect(shouldPersistDraftValue(number, 0)).toBe(false);
  });

  it("always persists lora-list values and treats them as valid", () => {
    const loraList = createControl({
      id: "lora-list-1",
      kind: "lora-list",
      name: "Loras",
      constraints: { min: 0, max: 2 },
      defaultValue: { loras: [] }
    });

    const withLoras = validateInlineControl(loraList, {
      loras: [{ loraName: "Houtengeki_Style.safetensors", strength: 0.8 }]
    });
    expect(withLoras.valid).toBe(true);

    const empty = validateInlineControl(loraList, { loras: [] });
    expect(empty.valid).toBe(true);

    expect(shouldPersistDraftValue(loraList, { loras: [] })).toBe(true);
  });

  it("blocks missing or duplicate Name fields when running", () => {
    const characterName = createControl({
      id: "character:name",
      category: "Character",
      defaultValue: "Sola"
    });
    const costumeName = createControl({
      id: "costume:name",
      category: "Costume",
      defaultValue: "Sola"
    });

    const missing = validateDraftForRun([characterName], {
      "character:name": ""
    });
    expect(missing.valid).toBe(false);
    expect(missing.errors[0]?.message).toContain("Name is required");

    const duplicate = validateDraftForRun([characterName, costumeName], {
      "character:name": "Sola",
      "costume:name": "Sola"
    });
    expect(duplicate.valid).toBe(false);
    expect(duplicate.errors.some((error) => error.message.includes("must be unique"))).toBe(true);
  });
});