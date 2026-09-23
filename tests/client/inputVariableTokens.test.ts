import { describe, expect, it } from "vitest";
import type { DynamicInputControl } from "../../src/shared/contracts/inputs";
import { buildVariableTokenParts } from "../../src/client/features/inputs/inputVariables";
import {
  buildTokenIndex,
  deriveSectionNamesByCategory,
  resolveTokensInText
} from "../../src/shared/workflow/inputTokens";

function createControl(category: string, name: string, defaultValue = "value"): DynamicInputControl {
  const id = `${category}:${name}`;
  return {
    id,
    kind: "multiline",
    inputIndex: 1,
    fullTitle: `[Input1] ${category}.${name}`,
    category,
    name,
    source: { nodeId: id, titlePath: `${id}._meta.title`, valuePath: ["value"] },
    constraints: {},
    defaultValue,
    orderKey: `000001:[Input1] ${category}.${name}`
  };
}

describe("buildVariableTokenParts", () => {
  it("emits the dot form for a simple category and field", () => {
    expect(buildVariableTokenParts(createControl("Character", "Eyes")).generic).toBe("{Character.Eyes}");
  });

  it("converts spaces to underscores on both sides", () => {
    const parts = buildVariableTokenParts(createControl("Character Pose", "Face"));
    expect(parts.generic).toBe("{Character_Pose.Face}");

    expect(buildVariableTokenParts(createControl("Character", "Body Details")).generic).toBe(
      "{Character.Body_Details}"
    );
  });

  it("emits the named form from the section name", () => {
    const parts = buildVariableTokenParts(createControl("Scene", "Artist"), "Sunflower Field");
    expect(parts.generic).toBe("{Scene.Artist}");
    expect(parts.named).toBe("{Sunflower_Field.Artist}");
  });

  it("omits the named form when the section has no name", () => {
    expect(buildVariableTokenParts(createControl("Config", "Steps")).named).toBeNull();
  });

  it("produces tokens the resolver actually resolves", () => {
    const controls = [
      createControl("Character Pose", "Name", "Pose"),
      createControl("Character Pose", "Face", "wide smile"),
      createControl("Character", "Name", "Sola"),
      createControl("Character", "Body Details", "freckles")
    ];
    const index = buildTokenIndex(controls, {});
    const names = deriveSectionNamesByCategory(controls, {});

    for (const control of controls) {
      const parts = buildVariableTokenParts(control, names[control.category]);
      expect(resolveTokensInText(parts.generic, index)).not.toBe(parts.generic);
      if (parts.named) {
        expect(resolveTokensInText(parts.named, index)).not.toBe(parts.named);
      }
    }
  });
});
