import { describe, expect, it } from "vitest";
import { deriveInputControls } from "../../src/shared/workflow/deriveInputControls";

describe("deriveInputControls", () => {
  it("derives stable controls using strict [Input#] parsing and metadata-declared kinds", () => {
    const workflow = {
      "10": {
        class_type: "Prompt",
        inputs: {
          title: "[Input2] Character.Body",
          __input: {
            kind: "text",
            field: "text"
          },
          text: "base prompt"
        }
      },
      "11": {
        class_type: "Prompt",
        inputs: {
          title: "[Input2] Character.Face.Eyes",
          __input: {
            kind: "multiline",
            field: "text"
          },
          text: "blue eyes"
        }
      },
      "12": {
        class_type: "Sampler",
        inputs: {
          title: "[Input1] Settings.Steps",
          __input: {
            kind: "number",
            field: "steps"
          },
          steps: 30
        }
      },
      "13": {
        class_type: "Sampler",
        inputs: {
          title: "[input3] Settings.CFG",
          __input: {
            kind: "number",
            field: "cfg"
          },
          cfg: 7
        }
      },
      "14": {
        class_type: "Loader",
        inputs: {
          title: "[Input4] Refs.Bad@Name",
          __input: {
            kind: "image",
            field: "image"
          },
          image: "data:image/png;base64,abc"
        }
      },
      "15": {
        class_type: "Toggle",
        inputs: {
          title: "[Input5] Flags.UseFace",
          __input: {
            kind: "boolean",
            field: "enabled"
          },
          enabled: true
        }
      },
      "16": {
        class_type: "Size",
        inputs: {
          title: "[Input6] Render.Size",
          __input: {
            kind: "dimension",
            widthField: "width",
            heightField: "height"
          },
          width: 768,
          height: 1024
        }
      },
      "17": {
        class_type: "Sampler",
        inputs: {
          title: "[Input3] Settings.Seed",
          __input: {
            kind: "number",
            field: "seed"
          }
        }
      }
    };

    const result = deriveInputControls(workflow);

    expect(result.controls.map((control) => control.fullTitle)).toEqual([
      "[Input1] Settings.Steps",
      "[Input2] Character.Body",
      "[Input2] Character.Face.Eyes",
      "[Input5] Flags.UseFace",
      "[Input6] Render.Size"
    ]);

    expect(result.controls.find((control) => control.fullTitle.includes("Face"))?.name).toBe("Face.Eyes");
    expect(result.warnings.some((warning) => warning.code === "disallowed-symbol")).toBe(true);
    expect(result.warnings.some((warning) => warning.code === "missing-editable-value")).toBe(true);
    expect(result.sections.map((section) => section.category)).toEqual([
      "Settings",
      "Character",
      "Flags",
      "Render"
    ]);
  });

  it("falls back to Uncategorized when category.name cannot be parsed cleanly", () => {
    const workflow = {
      "1": {
        class_type: "Prompt",
        inputs: {
          title: "[Input1] NameOnly",
          __input: {
            kind: "text",
            field: "text"
          },
          text: "hello"
        }
      }
    };

    const result = deriveInputControls(workflow);
    expect(result.controls[0]?.category).toBe("Uncategorized");
    expect(result.controls[0]?.name).toBe("NameOnly");
  });
});