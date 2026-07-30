import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DynamicInputControl, DynamicInputWarning } from "../../src/shared/contracts/inputs";
import type { WorkflowTemplateRecord } from "../../src/shared/contracts/workflow";
import { DynamicInputEditor } from "../../src/client/features/inputs/DynamicInputEditor";
import { DynamicInputEditorView } from "../../src/client/features/inputs/DynamicInputEditor";
import {
  applyExternalDraftValues,
  applyImportedWorkflowInputs,
  applyOrderingOverlay,
  buildOverlayForSectionOrder,
  buildSectionsFromControls
} from "../../src/client/features/inputs/useDynamicInputEditor";

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
        sections={buildSectionsFromControls(controls)}
        sectionColumnByCategory={{}}
        columnsSplitRatio={0.5}
        warnings={warnings}
        draftValues={{
          [controls[0].id]: "Nora",
          [controls[1].id]: 30
        }}
        hasDraftDiffFromTemplate={true}
        editedControlIds={new Set()}
        inlineErrorsByControlId={{}}
        runBlockingMessage={null}
        setValue={vi.fn()}
        moveSection={vi.fn()}
        toggleSectionColumn={vi.fn()}
        setColumnsSplitRatio={vi.fn()}
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

  it("renders generic and named variable copy links for supported inputs", () => {
    const controls: DynamicInputControl[] = [
      {
        id: "character:name",
        kind: "text",
        inputIndex: 1,
        fullTitle: "[Input1] Character.Name",
        category: "Character",
        name: "Name",
        source: {
          nodeId: "character",
          titlePath: "character.inputs.title",
          valuePath: ["name"]
        },
        constraints: {},
        defaultValue: "Sola",
        orderKey: "000001:[Input1] Character.Name"
      },
      {
        id: "character:eyes",
        kind: "text",
        inputIndex: 2,
        fullTitle: "[Input2] Character.Eyes",
        category: "Character",
        name: "Eyes",
        source: {
          nodeId: "character",
          titlePath: "character.inputs.title",
          valuePath: ["eyes"]
        },
        constraints: {},
        defaultValue: "gold",
        orderKey: "000002:[Input2] Character.Eyes"
      }
    ];

    const html = renderToStaticMarkup(
      <DynamicInputEditorView
        controls={controls}
        sections={buildSectionsFromControls(controls)}
        sectionNamesByCategory={{ Character: "Sola" }}
        sectionColumnByCategory={{}}
        columnsSplitRatio={0.5}
        warnings={[]}
        draftValues={{
          "character:name": "Sola",
          "character:eyes": "gold"
        }}
        hasDraftDiffFromTemplate={false}
        editedControlIds={new Set()}
        inlineErrorsByControlId={{}}
        runBlockingMessage={null}
        setValue={vi.fn()}
        moveSection={vi.fn()}
        toggleSectionColumn={vi.fn()}
        setColumnsSplitRatio={vi.fn()}
        resetToTemplateDefaults={vi.fn()}
        onRun={vi.fn()}
      />
    );

    expect(html).toContain("{Character_Eyes}");
    expect(html).toContain("{Sola_Eyes}");
    expect(html).not.toContain("{Character_Name}");
    expect(html).not.toContain("{Sola_Name}");
  });

  it("forwards named aliases through the wrapper component", () => {
    const template: WorkflowTemplateRecord = {
      fingerprint: "fp-1",
      displayName: "Test workflow",
      schemaVersion: "comfyui-v1",
      importedAt: new Date().toISOString(),
      rawText: JSON.stringify({
        character: {
          class_type: "CR Text",
          inputs: {
            text: "Sola"
          },
          _meta: {
            title: "[Input1] Character.Name"
          }
        },
        eyes: {
          class_type: "CR Text",
          inputs: {
            text: "gold"
          },
          _meta: {
            title: "[Input2] Character.Eyes"
          }
        }
      }),
      rawJson: {
        character: {
          class_type: "CR Text",
          inputs: {
            text: "Sola"
          },
          _meta: {
            title: "[Input1] Character.Name"
          }
        },
        eyes: {
          class_type: "CR Text",
          inputs: {
            text: "gold"
          },
          _meta: {
            title: "[Input2] Character.Eyes"
          }
        }
      },
      validation: {
        shapeValid: true,
        templateValid: true,
        issues: []
      }
    };

    const html = renderToStaticMarkup(
      <DynamicInputEditor
        activeTemplate={template}
        onRunPayloadBuilt={vi.fn()}
        onRunValidationFailed={vi.fn()}
      />
    );

    expect(html).toContain("{Sola_Eyes}");
    expect(html).toContain("{Character_Eyes}");
  });

  it("renders run-blocking and unsaved-state feedback with structural class hooks", () => {
    const controls = createControls();

    const html = renderToStaticMarkup(
      <DynamicInputEditorView
        controls={controls}
        sections={buildSectionsFromControls(controls)}
        sectionColumnByCategory={{}}
        columnsSplitRatio={0.5}
        warnings={[]}
        draftValues={{
          [controls[0].id]: "Nora",
          [controls[1].id]: 30
        }}
        hasDraftDiffFromTemplate={false}
        editedControlIds={new Set([controls[0].id])}
        inlineErrorsByControlId={{
          [controls[0].id]: "Name is required"
        }}
        runBlockingMessage="Fix validation before running"
        setValue={vi.fn()}
        moveSection={vi.fn()}
        toggleSectionColumn={vi.fn()}
        setColumnsSplitRatio={vi.fn()}
        resetToTemplateDefaults={vi.fn()}
        onRun={vi.fn()}
      />
    );

    expect(html).toContain("Fix validation before running");
    expect(html).toContain("is-edited");
    expect(html).toContain("input-run-fab");
    expect(html).toContain("input-category");
    expect(html).not.toContain("Show source mapping");
  });

  it("hides detailer lora rows when the master detailer-lora toggle is off", () => {
    const controls: DynamicInputControl[] = [
      {
        id: "detailer:boolean:toggle",
        kind: "boolean",
        inputIndex: 1,
        fullTitle: "[Input1] Detailer.Use Different Detailer Loras?",
        category: "Detailer",
        name: "Use Different Detailer Loras?",
        source: {
          nodeId: "a",
          titlePath: "a._meta.title",
          valuePath: ["value"]
        },
        constraints: {},
        defaultValue: false,
        orderKey: "000001:[Input1] Detailer.Use Different Detailer Loras?"
      },
      {
        id: "detailer:lora-row:lora_1",
        kind: "lora-row",
        inputIndex: 2,
        fullTitle: "[Input2] Detailer.Bhive_Style.safetensors",
        category: "Detailer",
        name: "Bhive_Style.safetensors",
        source: {
          nodeId: "b",
          titlePath: "b._meta.title",
          valuePath: ["lora_1"]
        },
        constraints: { min: -5, max: 5 },
        defaultValue: {
          enabled: false,
          loraName: "Bhive_Style.safetensors",
          strength: 1
        },
        orderKey: "000002:[Input2] Detailer.Bhive_Style.safetensors"
      }
    ];

    const html = renderToStaticMarkup(
      <DynamicInputEditorView
        controls={controls}
        sections={buildSectionsFromControls(controls)}
        sectionColumnByCategory={{}}
        columnsSplitRatio={0.5}
        warnings={[]}
        draftValues={{
          "detailer:boolean:toggle": false,
          "detailer:lora-row:lora_1": {
            enabled: false,
            loraName: "Bhive_Style.safetensors",
            strength: 1
          }
        }}
        hasDraftDiffFromTemplate={false}
        editedControlIds={new Set()}
        inlineErrorsByControlId={{}}
        runBlockingMessage={null}
        setValue={vi.fn()}
        moveSection={vi.fn()}
        toggleSectionColumn={vi.fn()}
        setColumnsSplitRatio={vi.fn()}
        resetToTemplateDefaults={vi.fn()}
        onRun={vi.fn()}
      />
    );

    expect(html).toContain("Use Different Detailer Loras?");
    expect(html).toContain("input-inline-hint-button");
    expect(html).toContain("Toggle &quot;Use Different Detailer Loras?&quot; to show or hide detailer lora rows.");
    expect(html).not.toContain("Bhive_Style.safetensors");
  });

  it("keeps detailer info hint visible when master toggle is on", () => {
    const controls: DynamicInputControl[] = [
      {
        id: "detailer:boolean:toggle",
        kind: "boolean",
        inputIndex: 1,
        fullTitle: "[Input1] Detailer.Use Different Detailer Loras?",
        category: "Detailer",
        name: "Use Different Detailer Loras?",
        source: {
          nodeId: "a",
          titlePath: "a._meta.title",
          valuePath: ["value"]
        },
        constraints: {},
        defaultValue: true,
        orderKey: "000001:[Input1] Detailer.Use Different Detailer Loras?"
      }
    ];

    const html = renderToStaticMarkup(
      <DynamicInputEditorView
        controls={controls}
        sections={buildSectionsFromControls(controls)}
        sectionColumnByCategory={{}}
        columnsSplitRatio={0.5}
        warnings={[]}
        draftValues={{
          "detailer:boolean:toggle": true
        }}
        hasDraftDiffFromTemplate={false}
        editedControlIds={new Set()}
        inlineErrorsByControlId={{}}
        runBlockingMessage={null}
        setValue={vi.fn()}
        moveSection={vi.fn()}
        toggleSectionColumn={vi.fn()}
        setColumnsSplitRatio={vi.fn()}
        resetToTemplateDefaults={vi.fn()}
        onRun={vi.fn()}
      />
    );

    expect(html).toContain("Use Different Detailer Loras?");
    expect(html).toContain("input-inline-hint-button");
    expect(html).toContain("Toggle &quot;Use Different Detailer Loras?&quot; to show or hide detailer lora rows.");
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

  it("builds category-reordered overlay preserving controls inside each category", () => {
    const controls = [
      ...createControls(),
      {
        id: "c:text:mood",
        kind: "text",
        inputIndex: 3,
        fullTitle: "[Input3] Character.Mood",
        category: "Character",
        name: "Mood",
        source: {
          nodeId: "c",
          titlePath: "c.inputs.title",
          valuePath: ["mood"]
        },
        constraints: {},
        defaultValue: "Calm",
        orderKey: "000003:[Input3] Character.Mood"
      } satisfies DynamicInputControl
    ];

    const sections = buildSectionsFromControls(controls);
    const reorderedSections = [sections[1], sections[0]];
    const overlay = buildOverlayForSectionOrder({
      orderedSections: reorderedSections,
      controls
    });
    const reorderedControls = applyOrderingOverlay(controls, overlay);

    expect(reorderedControls.map((control) => control.id)).toEqual([
      "b:number:steps",
      "a:text:value",
      "c:text:mood"
    ]);
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

  it("overwrites a target input with an empty source value when importing job inputs", () => {
    const sourceWorkflow = {
      "10": {
        class_type: "Prompt",
        inputs: {
          title: "[Input1] Character.Prompt",
          __input: {
            kind: "text",
            field: "text"
          },
          text: ""
        }
      }
    };

    const currentControls: DynamicInputControl[] = [
      {
        id: "local:text:prompt",
        kind: "text",
        inputIndex: 1,
        fullTitle: "[Input1] Character.Prompt",
        category: "Character",
        name: "Prompt",
        source: {
          nodeId: "local",
          titlePath: "local.inputs.title",
          valuePath: ["text"]
        },
        constraints: {},
        defaultValue: "",
        orderKey: "000001:[Input1] Character.Prompt"
      }
    ];

    const result = applyImportedWorkflowInputs({
      sourceWorkflowRawJson: sourceWorkflow,
      selectedCategories: ["Character"],
      currentDraftValues: { "local:text:prompt": "existing prompt" },
      currentControls
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.matchedControls).toBe(1);
    expect(result.draftValues["local:text:prompt"]).toBe("");
  });
});
