import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DynamicInputControl, DynamicInputWarning } from "../../src/shared/contracts/inputs";
import { DynamicInputEditorView } from "../../src/client/features/inputs/DynamicInputEditor";
import { applyExternalDraftValues, applyOrderingOverlay } from "../../src/client/features/inputs/useDynamicInputEditor";

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
        hasUnsavedChangesSinceLastRun={false}
        inlineErrorsByControlId={{}}
        runBlockingMessage={null}
        showSourceMapping={false}
        setShowSourceMapping={vi.fn()}
        setValue={vi.fn()}
        resetToTemplateDefaults={vi.fn()}
        onRun={vi.fn()}
      />
    );

    expect(html).toContain("Dynamic Inputs");
    expect(html).toContain("Character");
    expect(html).toContain("Render");
    expect(html).toContain("Input warnings");
    expect(html).toContain("Reset to template defaults");
  });

  it("renders run-blocking and unsaved-state feedback with structural class hooks", () => {
    const controls = createControls();

    const html = renderToStaticMarkup(
      <DynamicInputEditorView
        controls={controls}
        warnings={[]}
        draftValues={{
          [controls[0].id]: "Nora",
          [controls[1].id]: 30
        }}
        hasDraftDiffFromTemplate={false}
        hasUnsavedChangesSinceLastRun={true}
        inlineErrorsByControlId={{
          [controls[0].id]: "Name is required"
        }}
        runBlockingMessage="Fix validation before running"
        showSourceMapping={true}
        setShowSourceMapping={vi.fn()}
        setValue={vi.fn()}
        resetToTemplateDefaults={vi.fn()}
        onRun={vi.fn()}
      />
    );

    expect(html).toContain("Fix validation before running");
    expect(html).toContain("Unsaved changes since last successful run.");
    expect(html).toContain("input-run-bar");
    expect(html).toContain("input-category");
    expect(html).toContain("input-source-mapping");
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

  it("loads external draft values when the template fingerprint matches", () => {
    const controls = createControls();
    const result = applyExternalDraftValues({
      currentTemplateFingerprint: "fp-1",
      sourceTemplateFingerprint: "fp-1",
      controls,
      externalDraftValues: {
        [controls[0].id]: "Mika"
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.draftValues[controls[0].id]).toBe("Mika");
    expect(result.draftValues[controls[1].id]).toBe(28);
  });

  it("blocks external draft values when the template fingerprint differs", () => {
    const result = applyExternalDraftValues({
      currentTemplateFingerprint: "fp-1",
      sourceTemplateFingerprint: "fp-2",
      controls: createControls(),
      externalDraftValues: {
        "a:text:value": "Mika"
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.reason).toContain("mismatch");
  });
});