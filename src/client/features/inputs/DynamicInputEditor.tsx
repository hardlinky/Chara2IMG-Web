import { ChangeEvent } from "react";
import type {
  DynamicInputControl,
  DynamicInputDraftValues,
  DynamicInputValue,
  DynamicInputWarning
} from "../../../shared/contracts/inputs";
import type { WorkflowTemplateRecord } from "../../../shared/contracts/workflow";
import { useDynamicInputEditor } from "./useDynamicInputEditor";

type DynamicInputEditorViewProps = {
  controls: DynamicInputControl[];
  warnings: DynamicInputWarning[];
  draftValues: DynamicInputDraftValues;
  hasDraftDiffFromTemplate: boolean;
  showSourceMapping: boolean;
  setShowSourceMapping: (next: boolean) => void;
  setValue: (controlId: string, value: DynamicInputValue) => void;
  resetToTemplateDefaults: () => void | Promise<void>;
};

function formatWarning(warning: DynamicInputWarning): string {
  return warning.message;
}

function toImageDraftValue(file: File): Promise<{ dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve({
        dataUrl: String(reader.result ?? "")
      });
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Failed to read image"));
    });
    reader.readAsDataURL(file);
  });
}

function renderInputControl(
  control: DynamicInputControl,
  draftValues: DynamicInputDraftValues,
  setValue: (controlId: string, value: DynamicInputValue) => void,
  showSourceMapping: boolean
) {
  const value = draftValues[control.id] ?? control.defaultValue;

  switch (control.kind) {
    case "text":
      return (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => setValue(control.id, event.target.value)}
        />
      );
    case "multiline":
      return (
        <textarea
          rows={4}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => setValue(control.id, event.target.value)}
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={typeof value === "number" ? value : 0}
          onChange={(event) => setValue(control.id, Number(event.target.value))}
        />
      );
    case "boolean":
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => setValue(control.id, event.target.checked)}
        />
      );
    case "dimension": {
      const dimensions =
        value && typeof value === "object" && "width" in value && "height" in value
          ? (value as { width: number; height: number })
          : { width: 0, height: 0 };

      return (
        <div>
          <label>
            Width
            <input
              type="number"
              value={dimensions.width}
              onChange={(event) => {
                setValue(control.id, {
                  width: Number(event.target.value),
                  height: dimensions.height
                });
              }}
            />
          </label>
          <label>
            Height
            <input
              type="number"
              value={dimensions.height}
              onChange={(event) => {
                setValue(control.id, {
                  width: dimensions.width,
                  height: Number(event.target.value)
                });
              }}
            />
          </label>
        </div>
      );
    }
    case "image": {
      const imageValue = value && typeof value === "object" && "dataUrl" in value ? String(value.dataUrl) : "";

      return (
        <div>
          <input
            type="file"
            accept="image/*"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }

              void toImageDraftValue(file).then((next) => {
                setValue(control.id, next);
              });
            }}
          />
          <button type="button" onClick={() => setValue(control.id, null)}>
            Remove
          </button>
          {imageValue ? <img alt={`${control.name} preview`} src={imageValue} width={128} /> : null}
        </div>
      );
    }
    default:
      return null;
  }
}

export function DynamicInputEditorView(props: DynamicInputEditorViewProps) {
  const sections = new Map<string, DynamicInputControl[]>();

  for (const control of props.controls) {
    const list = sections.get(control.category);
    if (list) {
      list.push(control);
      continue;
    }

    sections.set(control.category, [control]);
  }

  return (
    <section>
      <h2>Dynamic Inputs</h2>
      <p>Edit the workflow-derived input values below.</p>

      <label>
        <input
          type="checkbox"
          checked={props.showSourceMapping}
          onChange={(event) => props.setShowSourceMapping(event.target.checked)}
        />
        Show source mapping
      </label>

      {props.hasDraftDiffFromTemplate ? (
        <button type="button" onClick={() => void props.resetToTemplateDefaults()}>
          Reset to template defaults
        </button>
      ) : null}

      {props.warnings.length > 0 ? (
        <div>
          <h3>Input warnings</h3>
          <ul>
            {props.warnings.map((warning) => (
              <li key={`${warning.nodeId}:${warning.code}`}>{formatWarning(warning)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {[...sections.entries()].map(([category, controls]) => (
        <fieldset key={category}>
          <legend>{category}</legend>
          {controls.map((control) => (
            <div key={control.id}>
              <label>
                {control.name}
                {renderInputControl(control, props.draftValues, props.setValue, props.showSourceMapping)}
              </label>
              {props.showSourceMapping ? <p>{`${control.source.nodeId}.${control.source.valuePath.join(".")}`}</p> : null}
            </div>
          ))}
        </fieldset>
      ))}
    </section>
  );
}

type DynamicInputEditorProps = {
  activeTemplate: WorkflowTemplateRecord;
};

export function DynamicInputEditor(props: DynamicInputEditorProps) {
  const editor = useDynamicInputEditor(props.activeTemplate);

  return (
    <DynamicInputEditorView
      controls={editor.controls}
      warnings={editor.warnings}
      draftValues={editor.draftValues}
      hasDraftDiffFromTemplate={editor.hasDraftDiffFromTemplate}
      showSourceMapping={editor.showSourceMapping}
      setShowSourceMapping={editor.setShowSourceMapping}
      setValue={editor.setValue}
      resetToTemplateDefaults={editor.resetToTemplateDefaults}
    />
  );
}
