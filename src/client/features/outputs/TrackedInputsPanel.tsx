import { useEffect, useState } from "react";
import type { DynamicInputControl } from "../../../shared/contracts/inputs";
import { deriveInputControls } from "../../../shared/workflow/deriveInputControls";
import { getJobInputs } from "../../lib/api/jobsClient";
import { useTrackedInputCategories } from "../../lib/inputTrackingStorage";
import { looksLikeModelFile, stripModelExtension, toImageDataUrl } from "../../lib/modelAssets";

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
    case "text": {
      const text = typeof value === "string" ? value : "";
      return looksLikeModelFile(text) ? stripModelExtension(text) : text;
    }
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

export function TrackedInputsPanel({
  jobId,
  img2imgInputAvailable = false,
  onLoadImageIntoImg2Img
}: {
  jobId: string;
  img2imgInputAvailable?: boolean;
  onLoadImageIntoImg2Img?: (imageUrl: string) => void;
}) {
  const trackedCategories = useTrackedInputCategories();
  const [sections, setSections] = useState<TrackedSection[]>([]);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    if (lightboxSrc === null) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightboxSrc(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxSrc]);

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
    <>
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
                      <span className="tracked-inputs-field-label">{stripModelExtension(lora.loraName)}</span>
                      <span className="tracked-inputs-field-value">{lora.strength}</span>
                    </div>
                  );
                }

                if (control.kind === "image") {
                  const src = toImageDataUrl(imageDataUrl(control));
                  const canSend = Boolean(src && img2imgInputAvailable && onLoadImageIntoImg2Img);
                  return (
                    <div className="tracked-inputs-field tracked-inputs-field-block" key={control.id}>
                      <span className="tracked-inputs-field-label">{control.name}</span>
                      {src ? (
                        <div className="tracked-inputs-image-block">
                          <button
                            type="button"
                            className="tracked-inputs-image-btn"
                            onClick={() => setLightboxSrc(src)}
                            aria-label={`Inspect ${control.name}`}
                            title="Click to inspect"
                          >
                            <img className="tracked-inputs-image" alt={`${control.name} input`} src={src} />
                          </button>
                          {canSend ? (
                            <button
                              type="button"
                              className="btn btn-secondary tracked-inputs-send-btn"
                              onClick={() => onLoadImageIntoImg2Img?.(src)}
                              title="Load this image into the IMG2IMG input"
                            >
                              Send to inputs
                            </button>
                          ) : null}
                        </div>
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
    {lightboxSrc ? (
      <div
        className="tracked-inputs-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="Base image preview"
        onClick={() => setLightboxSrc(null)}
      >
        <button
          type="button"
          className="tracked-inputs-lightbox-close"
          aria-label="Close preview"
          onClick={() => setLightboxSrc(null)}
        >
          ✕
        </button>
        <img
          className="tracked-inputs-lightbox-image"
          src={lightboxSrc}
          alt="Base image preview"
          onClick={(event) => event.stopPropagation()}
        />
      </div>
    ) : null}
    </>
  );
}
