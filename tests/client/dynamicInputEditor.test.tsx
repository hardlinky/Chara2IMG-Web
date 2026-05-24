import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DynamicInputControl, DynamicInputWarning } from "../../src/shared/contracts/inputs";
import { DynamicInputEditorView } from "../../src/client/features/inputs/DynamicInputEditor";
import { applyOrderingOverlay } from "../../src/client/features/inputs/useDynamicInputEditor";

function createControls(): DynamicInputControl[] {
  return [
    {
      id: "a:text:value",
      kind: "text",
      inputIndex: 1,
      fullTitle: "[Input1] Character.Name",
      category: "Character",
      name: "Name",
      source: {
        nodeId: "a",
        titlePath: "a.inputs.title",
        valuePath: ["value"]
      },
      constraints: {},
      defaultValue: "Aki",
      orderKey: "000001:[Input1] Character.Name"
    },
    {
      id: "b:number:steps",
      kind: "number",
      inputIndex: 2,
      fullTitle: "[Input2] Render.Steps",
      category: "Render",
      name: "Steps",
      source: {
        nodeId: "b",
        titlePath: "b.inputs.title",
        valuePath: ["steps"]
      },
      constraints: {
        min: 1,
        max: 50
      },
      defaultValue: 28,
      orderKey: "000002:[Input2] Render.Steps"
    }
  ];
}

describe("dynamic input editor", () => {
  it("renders grouped controls and warnings", () => {
    const controls = createControls();
    const warnings: DynamicInputWarning[] = [
      {
        code: "unsupported-kind",
        nodeId: "x",
        title: "[Input3] Unknown.Value",
        message: "Unknown input type was hidden from the editor."
      }
    ];

    const html = renderToStaticMarkup(
      <DynamicInputEditorView
        controls={controls}
        warnings={warnings}
        draftValues={{
          [controls[0].id]: "Nora",
          [controls[1].id]: 30
        }}
        hasDraftDiffFromTemplate={true}
        showSourceMapping={false}
        setShowSourceMapping={vi.fn()}
        setValue={vi.fn()}
        resetToTemplateDefaults={vi.fn()}
      />
    );

    expect(html).toContain("Dynamic Inputs");
    expect(html).toContain("Character");
    expect(html).toContain("Render");
    expect(html).toContain("Input warnings");
    expect(html).toContain("Reset to template defaults");
  });

  it("applies overlay order and keeps new controls by default order", () => {
    const controls = createControls();
    const overlayOrdered = applyOrderingOverlay(controls, {
      orderByControlId: {
        "b:number:steps": 0,
        stale: 1
      }
    });

    expect(overlayOrdered.map((control) => control.id)).toEqual(["b:number:steps", "a:text:value"]);
  });
});