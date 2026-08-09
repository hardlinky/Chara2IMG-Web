import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DynamicInputControl, DynamicInputWarning } from "../../src/shared/contracts/inputs";
import type { WorkflowTemplateRecord } from "../../src/shared/contracts/workflow";
import { DynamicInputEditor } from "../../src/client/features/inputs/DynamicInputEditor";
import { DynamicInputEditorView, LoraTriggerTags, findLoraDownloadUrl, findLoraTriggerWords } from "../../src/client/features/inputs/DynamicInputEditor";
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

function createDimensionControl(): DynamicInputControl {
  return {
    id: "c:dimension:width:height",
    kind: "dimension",
    inputIndex: 3,
    fullTitle: "[Input3] Render.Size",
    category: "Render",
    name: "Size",
    source: {
      nodeId: "c",
      titlePath: "c.inputs.title",
      valuePath: ["width", "height"]
    },
    constraints: {},
    defaultValue: { width: 1024, height: 1024 },
    orderKey: "000003:[Input3] Render.Size"
  };
}

describe("dynamic input editor", () => {
  it("matches active LoRAs to safe download source URLs", () => {
    const urls = {
      "styles/Ink.SAFETENSORS": "https://civitai.com/models/123",
      "portrait.safetensors": "https://huggingface.co/example/portrait"
    };

    expect(findLoraDownloadUrl("styles\\ink.safetensors", urls)).toBe("https://civitai.com/models/123");
    expect(findLoraDownloadUrl("nested/portrait.safetensors", urls)).toBe("https://huggingface.co/example/portrait");
    expect(findLoraDownloadUrl("unknown.safetensors", urls)).toBeUndefined();
    expect(findLoraDownloadUrl("unsafe.safetensors", { "unsafe.safetensors": "javascript:alert(1)" })).toBeUndefined();
  });

  it("matches and renders clickable LoRA trigger-word tags", () => {
    const triggerWords = { "Styles/Ink.SAFETENSORS": ["ink style", "bold lines"] };
    expect(findLoraTriggerWords("styles\\ink.safetensors", triggerWords)).toEqual(["ink style", "bold lines"]);

    const html = renderToStaticMarkup(<LoraTriggerTags words={["ink style", "bold lines"]} />);
    expect(html).toContain('aria-label="Trigger words"');
    expect(html).toContain('aria-label="Copy trigger word ink style"');
    expect(html).toContain(">ink style</button>");
    expect(html).toContain(">bold lines</button>");
  });

  it("labels a non-empty active LoRA list from the workflow input name", () => {
    const control: DynamicInputControl = {
      id: "models:loras",
      kind: "lora-list",
      inputIndex: 1,
      fullTitle: "[Input1] Model.Loras",
      category: "Model",
      name: "Character Style LoRAs",
      source: { nodeId: "model", titlePath: "model.inputs.title", valuePath: ["lora_1"] },
      constraints: {},
      defaultValue: { loras: [{ loraName: "style.safetensors", strength: 1 }] },
      orderKey: "000001:models:loras"
    };
    const html = renderToStaticMarkup(
      <DynamicInputEditorView
        controls={[control]}
        sections={buildSectionsFromControls([control])}
        sectionColumnByCategory={{}}
        columnsSplitRatio={0.5}
        warnings={[]}
        draftValues={{ [control.id]: control.defaultValue }}
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

    expect(html).toContain('<h4 class="input-lora-list-title">Character Style LoRAs</h4>');
  });

  it("increments width and height controls in steps of 32", () => {
    const control = createDimensionControl();
    const html = renderToStaticMarkup(
      <DynamicInputEditorView
        controls={[control]}
        sections={buildSectionsFromControls([control])}
        sectionColumnByCategory={{}}
        columnsSplitRatio={0.5}
        warnings={[]}
        draftValues={{ [control.id]: { width: 1024, height: 768 } }}
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

    expect(html.match(/step="32"/g)).toHaveLength(2);
  });

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
        id: "detailer:lora-list",
        kind: "lora-list",
        inputIndex: 2,
        fullTitle: "[Input2] Detailer.Loras",
        category: "Detailer",
        name: "Loras",
        source: {
          nodeId: "b",
          titlePath: "b._meta.title",
          valuePath: ["lora_1"]
        },
        constraints: { min: 0, max: 2 },
        defaultValue: { loras: [{ loraName: "Bhive_Style.safetensors", strength: 1 }] },
        orderKey: "000002:[Input2] Detailer.Loras"
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
          "detailer:lora-list": { loras: [{ loraName: "Bhive_Style.safetensors", strength: 1 }] }
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

  it("restores checkpoint and LoRA list values from job inputs", () => {
    const sourceWorkflow = {
      "24": {
        class_type: "CheckpointLoaderSimple",
        inputs: {
          title: "[Input1] Models.Checkpoint",
          ckpt_name: "job-checkpoint.safetensors"
        }
      },
      "25": {
        class_type: "Power Lora Loader (rgthree)",
        inputs: {
          title: "[Input2] Models.Loras",
          lora_1: { on: true, lora: "job-style.safetensors", strength: 0.75 }
        }
      }
    };
    const currentControls: DynamicInputControl[] = [
      {
        id: "local:checkpoint:ckpt_name",
        kind: "checkpoint",
        inputIndex: 1,
        fullTitle: "[Input1] Models.Checkpoint",
        category: "Models",
        name: "Checkpoint",
        source: { nodeId: "local", titlePath: "local.inputs.title", valuePath: ["ckpt_name"] },
        constraints: {},
        defaultValue: "default.safetensors",
        orderKey: "000001:[Input1] Models.Checkpoint"
      },
      {
        id: "local:lora-list",
        kind: "lora-list",
        inputIndex: 2,
        fullTitle: "[Input2] Models.Loras",
        category: "Models",
        name: "Loras",
        source: { nodeId: "local", titlePath: "local.inputs.title", valuePath: ["lora_1"] },
        constraints: {},
        defaultValue: { loras: [] },
        orderKey: "000002:[Input2] Models.Loras"
      }
    ];

    const result = applyImportedWorkflowInputs({
      sourceWorkflowRawJson: sourceWorkflow,
      selectedCategories: ["Models"],
      currentDraftValues: {},
      currentControls
    });

    expect(result).toMatchObject({ ok: true, matchedControls: 2 });
    if (!result.ok) return;
    expect(result.draftValues["local:checkpoint:ckpt_name"]).toBe("job-checkpoint.safetensors");
    expect(result.draftValues["local:lora-list"]).toEqual({
      loras: [{ loraName: "job-style.safetensors", strength: 0.75 }]
    });
  });
});
