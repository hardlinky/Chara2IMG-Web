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

  it("derives controls from _meta.title with inferred Primitive metadata", () => {
    const workflow = {
      "588:580": {
        class_type: "PrimitiveString",
        inputs: {
          value: "Sola"
        },
        _meta: {
          title: "[Input0] Character.Name"
        }
      },
      "588:581": {
        class_type: "PrimitiveStringMultiline",
        inputs: {
          value: "line one\nline two"
        },
        _meta: {
          title: "[Input1] Character.Face"
        }
      },
      "536": {
        class_type: "PrimitiveBoolean",
        inputs: {
          value: false
        },
        _meta: {
          title: "[Input2] Detailer.Enabled"
        }
      }
    };

    const result = deriveInputControls(workflow);

    expect(result.controls).toHaveLength(3);
    expect(result.controls.map((control) => control.kind)).toEqual(["text", "multiline", "boolean"]);
    expect(result.controls.map((control) => control.fullTitle)).toEqual([
      "[Input0] Character.Name",
      "[Input1] Character.Face",
      "[Input2] Detailer.Enabled"
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("maps Power Lora Loader nodes into a single lora-list control", () => {
    const workflow = {
      "534": {
        class_type: "Power Lora Loader (rgthree)",
        inputs: {
          lora_1: {
            on: true,
            lora: "Houtengeki_Style.safetensors",
            strength: 1
          },
          lora_2: {
            on: false,
            lora: "Bhive_Style.safetensors",
            strength: 0.5
          }
        },
        _meta: {
          title: "[Input2] Detailer.Loras"
        }
      },
      "536": {
        class_type: "PrimitiveBoolean",
        inputs: {
          value: false
        },
        _meta: {
          title: "[Input1] Detailer.Use Different Detailer Loras?"
        }
      }
    };

    const result = deriveInputControls(workflow);

    expect(result.controls.map((control) => control.kind)).toEqual(["boolean", "lora-list"]);
    const loraList = result.controls.find((control) => control.id === "534:lora-list");
    expect(loraList?.source.valuePath).toEqual(["lora_1", "lora_2"]);
    // Only the on:true slot appears in the default value
    expect(loraList?.defaultValue).toEqual({ loras: [{ loraName: "Houtengeki_Style.safetensors", strength: 1 }] });
    expect(result.warnings).toEqual([]);
  });
});