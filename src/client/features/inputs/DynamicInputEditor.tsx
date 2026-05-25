import { ChangeEvent, useEffect } from "react";
import type {
  DynamicInputControl,
  DynamicInputDraftValues,
  DynamicInputInlineError,
  DynamicInputValue,
  DynamicInputWarning
} from "../../../shared/contracts/inputs";
import type { WorkflowTemplateRecord } from "../../../shared/contracts/workflow";
import { useDynamicInputEditor } from "./useDynamicInputEditor";
import "../../styles/setupInput.css";

type DynamicInputEditorViewProps = {
  controls: DynamicInputControl[];
  warnings: DynamicInputWarning[];
  draftValues: DynamicInputDraftValues;
  hasDraftDiffFromTemplate: boolean;
  hasUnsavedChangesSinceLastRun: boolean;
  inlineErrorsByControlId: Record<string, string>;
  runBlockingMessage: string | null;
  setValue: (controlId: string, value: DynamicInputValue) => void;
  resetToTemplateDefaults: () => void | Promise<void>;
  onRun: () => void;
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
  hasInlineError: boolean
) {
  const value = draftValues[control.id] ?? control.defaultValue;
  const className = hasInlineError ? "input input-invalid" : "input";

  switch (control.kind) {
    case "text":
      return (
        <input
          className={className}
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => setValue(control.id, event.target.value)}
        />
      );
    case "multiline":
      return (
        <textarea
          className={hasInlineError ? "textarea input-invalid" : "textarea"}
          rows={4}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => setValue(control.id, event.target.value)}
        />
      );
    case "number":
      return (
        <input
          className={className}
          type="number"
          value={typeof value === "number" ? value : 0}
          onChange={(event) => setValue(control.id, Number(event.target.value))}
        />
      );
    case "boolean":
      return (
        <input
          className={hasInlineError ? "interactive input-invalid" : "interactive"}
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
        <div className="input-dimension-grid">
          <label className="field">
            Width
            <input
              className={className}
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
          <label className="field">
            Height
            <input
              className={className}
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
        <div className="input-image-controls">
          <input
            className={className}
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
          <button className="btn btn-destructive" type="button" onClick={() => setValue(control.id, null)}>
            Remove
          </button>
          {imageValue ? <img alt={`${control.name} preview`} src={imageValue} width={128} /> : null}
        </div>
      );
    }
    case "lora-row": {
      const loraValue =
        value && typeof value === "object" && "enabled" in value && "loraName" in value && "strength" in value
          ? (value as { enabled: boolean; loraName: string; strength: number })
          : { enabled: false, loraName: control.name, strength: 0 };

      const min = control.constraints.min ?? -5;
      const max = control.constraints.max ?? 5;

      return (
        <div className="input-lora-card">
          <div className="input-lora-header">
            <label className="input-lora-toggle" htmlFor={`${control.id}-enabled`}>
              <input
                id={`${control.id}-enabled`}
                className={hasInlineError ? "interactive input-invalid" : "interactive"}
                type="checkbox"
                checked={loraValue.enabled}
                onChange={(event) =>
                  setValue(control.id, {
                    ...loraValue,
                    enabled: event.target.checked
                  })
                }
              />
              Enabled
            </label>

            <label className="input-lora-strength-field" htmlFor={`${control.id}-strength`}>
              Strength
              <input
                id={`${control.id}-strength`}
                className={className}
                type="number"
                min={min}
                max={max}
                step={0.05}
                value={loraValue.strength}
                onChange={(event) =>
                  setValue(control.id, {
                    ...loraValue,
                    strength: Number(event.target.value)
                  })
                }
              />
            </label>
          </div>

          <input
            className={hasInlineError ? "input-lora-slider input-invalid" : "input-lora-slider"}
            type="range"
            min={min}
            max={max}
            step={0.05}
            value={loraValue.strength}
            onChange={(event) =>
              setValue(control.id, {
                ...loraValue,
                strength: Number(event.target.value)
              })
            }
          />
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
    <section className="input-card">
      <h2>Dynamic Inputs</h2>
      <p>Edit the workflow-derived input values below.</p>

      {props.hasDraftDiffFromTemplate ? (
        <div className="input-actions">
          <button className="btn btn-secondary" type="button" onClick={() => void props.resetToTemplateDefaults()}>
            Reset to template defaults
          </button>
        </div>
      ) : null}

      {props.warnings.length > 0 ? (
        <div className="input-warnings">
          <h3>Input warnings</h3>
          <ul>
            {props.warnings.map((warning) => (
              <li key={`${warning.nodeId}:${warning.code}`}>{formatWarning(warning)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {props.runBlockingMessage ? (
        <p role="alert" className="input-error">
          {props.runBlockingMessage}
        </p>
      ) : null}
      {props.hasUnsavedChangesSinceLastRun ? (
        <p className="input-status">Unsaved changes since last successful run.</p>
      ) : null}

      {[...sections.entries()].map(([category, controls]) => (
        <fieldset key={category} className="input-category">
          <legend>{category}</legend>
          {controls.map((control) => (
            <div key={control.id} className="input-row">
              <label className="field">
                {control.name}
                {renderInputControl(
                  control,
                  props.draftValues,
                  props.setValue,
                  Boolean(props.inlineErrorsByControlId[control.id])
                )}
              </label>
              {props.inlineErrorsByControlId[control.id] ? (
                <p role="alert" className="input-error">
                  {props.inlineErrorsByControlId[control.id]}
                </p>
              ) : null}
            </div>
          ))}
        </fieldset>
      ))}

      <div className="input-run-bar">
        <button className="btn btn-primary" type="button" onClick={props.onRun}>
          Run with current inputs
        </button>
      </div>
    </section>
  );
}

type DynamicInputEditorProps = {
  activeTemplate: WorkflowTemplateRecord;
  onRunPayloadBuilt?: (snapshot: {
    payload: Record<string, unknown>;
    draftValues: DynamicInputDraftValues;
    templateFingerprint: string;
  }) => Promise<void>;
  onRunValidationFailed?: (errors: DynamicInputInlineError[]) => void;
  onEditorReady?: (api: {
    applyExternalDraftValues: (sourceTemplateFingerprint: string, externalDraftValues: DynamicInputDraftValues) => Promise<{
      ok: true;
      draftValues: DynamicInputDraftValues;
    } | {
      ok: false;
      reason: string;
    }>;
  }) => void;
};

export function DynamicInputEditor(props: DynamicInputEditorProps) {
  const editor = useDynamicInputEditor(props.activeTemplate);

  useEffect(() => {
    props.onEditorReady?.({
      applyExternalDraftValues: editor.applyExternalDraft
    });
  }, [editor.applyExternalDraft, props.onEditorReady]);

  function onRun(): void {
    const result = editor.attemptRun();
    if (!result.ok) {
      props.onRunValidationFailed?.(result.errors);
      return;
    }

    void props.onRunPayloadBuilt?.({
      payload: result.payload,
      draftValues: editor.draftValues,
      templateFingerprint: props.activeTemplate.fingerprint
    });
  }

  return (
    <DynamicInputEditorView
      controls={editor.controls}
      warnings={editor.warnings}
      draftValues={editor.draftValues}
      hasDraftDiffFromTemplate={editor.hasDraftDiffFromTemplate}
      hasUnsavedChangesSinceLastRun={editor.hasUnsavedChangesSinceLastRun}
      inlineErrorsByControlId={editor.inlineErrorsByControlId}
      runBlockingMessage={editor.runBlockingMessage}
      setValue={editor.setValue}
      resetToTemplateDefaults={editor.resetToTemplateDefaults}
      onRun={onRun}
    />
  );
}
