import { useEffect, useState } from "react";
import type { DynamicInputControl } from "../../../shared/contracts/inputs";
import { deriveInputControls } from "../../../shared/workflow/deriveInputControls";
import { getJobInputs } from "../../lib/api/jobsClient";
import { useTrackedInputCategories } from "../../lib/inputTrackingStorage";

type TrackedSection = {
  category: string;
  controls: DynamicInputControl[];
};

function normalizeWorkflowSource(rawJson: unknown): unknown {
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) {
    return rawJson;
  }

  const record = rawJson as Record<string, unknown>;
  const nestedWorkflow = record.workflow;
  if (nestedWorkflow && typeof nestedWorkflow === "object" && !Array.isArray(nestedWorkflow)) {
    return nestedWorkflow;
  }

  return rawJson;
}

function formatControlValue(control: DynamicInputControl): string {
  const value = control.defaultValue;

  switch (control.kind) {
    case "text":
    case "multiline":
      return typeof value === "string" ? value : "";
    case "number":
      return typeof value === "number" || typeof value === "string" ? String(value) : "";
    case "boolean":
      return value ? "On" : "Off";
    case "dimension":
      if (value && typeof value === "object" && "width" in value && "height" in value) {
        const dimension = value as { width: number; height: number };
        return `${dimension.width} × ${dimension.height}`;
      }
      return "";
    case "lora-row":
      if (value && typeof value === "object" && "enabled" in value && "loraName" in value && "strength" in value) {
        const lora = value as { enabled: boolean; loraName: string; strength: number };
        return lora.enabled ? `<${lora.loraName}:${lora.strength}>` : "Off";
      }
      return "";
    default:
      return "";
  }
}

function imageDataUrl(control: DynamicInputControl): string {
  const value = control.defaultValue;
  if (value && typeof value === "object" && "dataUrl" in value) {
    return String((value as { dataUrl: unknown }).dataUrl ?? "");
  }
  return "";
}

// Derived image values are often raw base64 (no data: prefix); sniff the
// signature so the browser can render them.
function toImageSrc(raw: string): string {
  if (!raw) {
    return "";
  }
  if (raw.startsWith("data:")) {
    return raw;
  }

  let mimeType = "image/png";
  if (raw.startsWith("/9j/")) {
    mimeType = "image/jpeg";
  } else if (raw.startsWith("R0lGOD")) {
    mimeType = "image/gif";
  } else if (raw.startsWith("UklGR")) {
    mimeType = "image/webp";
  }

  return `data:${mimeType};base64,${raw}`;
}

function cleanLoraName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, "");
}

function isEnabledLora(control: DynamicInputControl): boolean {
  const value = control.defaultValue;
  return Boolean(
    value && typeof value === "object" && "enabled" in value && (value as { enabled: unknown }).enabled
  );
}

function isRenderable(control: DynamicInputControl): boolean {
  if (control.kind === "lora-row") {
    return isEnabledLora(control);
  }
  return true;
}

export function TrackedInputsPanel({ jobId }: { jobId: string }) {
  const trackedCategories = useTrackedInputCategories();
  const [sections, setSections] = useState<TrackedSection[]>([]);

  useEffect(() => {
    if (trackedCategories.length === 0) {
      setSections([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const inputs = await getJobInputs(jobId);
        if (cancelled) {
          return;
        }
        if (!inputs) {
          setSections([]);
          return;
        }

        const derivation = deriveInputControls(normalizeWorkflowSource(inputs.submittedInput));
        const controlsById = new Map(derivation.controls.map((control) => [control.id, control]));
        const built = derivation.sections
          .filter((section) => trackedCategories.includes(section.category))
          .map((section) => ({
            category: section.category,
            controls: section.controlIds
              .map((controlId) => controlsById.get(controlId))
              .filter((control): control is DynamicInputControl => Boolean(control))
          }))
          .filter((section) => section.controls.length > 0);

        setSections(built);
      } catch {
        if (!cancelled) {
          setSections([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId, trackedCategories]);

  if (trackedCategories.length === 0 || sections.length === 0) {
    return null;
  }

  return (
    <div className="tracked-inputs-panel">
      {sections.map((section) => {
        const visibleControls = section.controls.filter(isRenderable);
        if (visibleControls.length === 0) {
          return null;
        }

        return (
          <div className="tracked-inputs-category" key={section.category}>
            <h4 className="tracked-inputs-category-title">{section.category}</h4>
            <div className="tracked-inputs-fields">
              {visibleControls.map((control) => {
                if (control.kind === "lora-row") {
                  const lora = control.defaultValue as { loraName: string; strength: number };
                  return (
                    <div className="tracked-inputs-field" key={control.id}>
                      <span className="tracked-inputs-field-label">{cleanLoraName(lora.loraName)}</span>
                      <span className="tracked-inputs-field-value">{lora.strength}</span>
                    </div>
                  );
                }

                if (control.kind === "image") {
                  const src = toImageSrc(imageDataUrl(control));
                  return (
                    <div className="tracked-inputs-field tracked-inputs-field-block" key={control.id}>
                      <span className="tracked-inputs-field-label">{control.name}</span>
                      {src ? (
                        <img className="tracked-inputs-image" alt={`${control.name} input`} src={src} />
                      ) : (
                        <span className="tracked-inputs-field-value">—</span>
                      )}
                    </div>
                  );
                }

                const text = formatControlValue(control);
                const isBlock = control.kind === "multiline";
                return (
                  <div
                    className={`tracked-inputs-field${isBlock ? " tracked-inputs-field-block" : ""}`}
                    key={control.id}
                  >
                    <span className="tracked-inputs-field-label">{control.name}</span>
                    <span className="tracked-inputs-field-value">{text.length > 0 ? text : "—"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
