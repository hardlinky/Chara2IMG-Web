import { describe, expect, it } from "vitest";
import type { DynamicInputControl, DynamicInputDraftValues } from "../../src/shared/contracts/inputs";
import { buildTokenIndex, resolveTokensInText } from "../../src/shared/workflow/inputTokens";

function createControl(category: string, name: string, defaultValue: string): DynamicInputControl {
  const id = `${category}:${name}`;
  return {
    id,
    kind: "multiline",
    inputIndex: 1,
    fullTitle: `[Input1] ${category}.${name}`,
    category,
    name,
    source: {
      nodeId: id,
      titlePath: `${id}._meta.title`,
      valuePath: ["value"]
    },
    constraints: {},
    defaultValue,
    orderKey: `000001:[Input1] ${category}.${name}`
  };
}

function resolve(text: string, controls: DynamicInputControl[], draftValues: DynamicInputDraftValues = {}): string {
  return resolveTokensInText(text, buildTokenIndex(controls, draftValues));
}

describe("resolveTokensInText", () => {
  it("resolves a generic category-alias token", () => {
    const controls = [createControl("Character", "Eyes", "yellow eyes")];

    expect(resolve("{Character_Eyes}", controls)).toBe("yellow eyes");
  });

  it("resolves the aliased Character Pose category", () => {
    const controls = [createControl("Character Pose", "Arms", "skirt tug")];

    expect(resolve("{CharaPose_Arms}", controls)).toBe("skirt tug");
  });

  it("matches multi-word field names regardless of separator spelling", () => {
    const controls = [createControl("Character", "Body Details", "freckles")];

    expect(resolve("{Character_BodyDetails}", controls)).toBe("freckles");
    expect(resolve("{Character_Body_Details}", controls)).toBe("freckles");
    expect(resolve("{character bodydetails}", controls)).toBe("freckles");
  });

  it("resolves the named form through the section Name value", () => {
    const controls = [
      createControl("Character", "Name", "Ellie"),
      createControl("Character", "Eyes", "green eyes")
    ];

    expect(resolve("{Ellie_Eyes}", controls)).toBe("green eyes");
  });

  it("follows the edited Name value rather than the template default", () => {
    const nameControl = createControl("Character", "Name", "Ellie");
    const controls = [nameControl, createControl("Character", "Eyes", "green eyes")];

    expect(resolve("{Nora_Eyes}", controls, { [nameControl.id]: "Nora" })).toBe("green eyes");
  });

  it("uses edited draft values over template defaults", () => {
    const control = createControl("Character", "Eyes", "green eyes");

    expect(resolve("{Character_Eyes}", [control], { [control.id]: "blue eyes" })).toBe("blue eyes");
  });

  it("leaves unknown tokens literal", () => {
    const controls = [createControl("Character", "Eyes", "green eyes")];

    expect(resolve("{Character_Nose}", controls)).toBe("{Character_Nose}");
  });

  it("preserves ComfyUI wildcard syntax", () => {
    const controls = [createControl("Character", "Eyes", "green eyes")];

    expect(resolve("{red|blue|green}", controls)).toBe("{red|blue|green}");
  });

  it("resolves every token in a multi-line prompt", () => {
    const controls = [
      createControl("Character", "Eyes", "green eyes"),
      createControl("Costume", "Top", "corset")
    ];

    expect(resolve("masterpiece,\n{Character_Eyes}, {Costume_Top}", controls)).toBe(
      "masterpiece,\ngreen eyes, corset"
    );
  });

  it("does not recurse into resolved values", () => {
    const controls = [
      createControl("Character", "Body", "tall {Costume_Top}"),
      createControl("Costume", "Top", "corset")
    ];

    expect(resolve("{Character_Body}", controls)).toBe("tall {Costume_Top}");
  });

  it("ignores non-string controls", () => {
    const control: DynamicInputControl = {
      ...createControl("Config", "Steps", ""),
      kind: "number",
      defaultValue: 30
    };

    expect(resolve("{Config_Steps}", [control])).toBe("{Config_Steps}");
  });
});
