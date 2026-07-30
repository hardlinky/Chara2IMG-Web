import { ChangeEvent, InputHTMLAttributes, useEffect, useMemo, useRef, useState } from "react";
import type {
  DynamicInputControl,
  DynamicInputDraftValues,
  DynamicInputInlineError,
  DynamicInputSection,
  DynamicInputValue,
  DynamicInputWarning
} from "../../../shared/contracts/inputs";
import type { WorkflowTemplateRecord } from "../../../shared/contracts/workflow";
import { useDynamicInputEditor } from "./useDynamicInputEditor";
import { buildVariableTokenParts, isNameField, getCategoriesWithName } from "./inputVariables";
import { toggleCategoryTracked, useTrackedInputCategories } from "../../lib/inputTrackingStorage";
import { toImageDataUrl } from "../../lib/modelAssets";
import "../../styles/setupInput.css";

// Integer-valued inputs step by 1; every other number spinner steps by 0.05.
const INTEGER_NUMBER_FIELDS = new Set(["steps", "batch_size", "seed", "int"]);

function resolveNumberStep(control: DynamicInputControl): number {
  if (control.constraints.precision === 0) {
    return 1;
  }
  const field = control.source.valuePath[control.source.valuePath.length - 1];
  if (field && INTEGER_NUMBER_FIELDS.has(field)) {
    return 1;
  }
  return 0.05;
}

function stepDecimals(step: number): number {
  if (Number.isInteger(step)) {
    return 0;
  }
  const text = String(step);
  const dotIndex = text.indexOf(".");
  return dotIndex === -1 ? 0 : text.length - dotIndex - 1;
}

// Number input that also steps on mouse wheel while hovered. Uses a non-passive
// native listener because React's synthetic onWheel cannot preventDefault.
function WheelNumberInput({
  wheelStep,
  currentValue,
  onWheelStep,
  ...inputProps
}: {
  wheelStep: number;
  currentValue: number;
  onWheelStep: (next: number) => void;
} & InputHTMLAttributes<HTMLInputElement>) {
  const ref = useRef<HTMLInputElement | null>(null);
  const stateRef = useRef({ wheelStep, currentValue, onWheelStep });
  stateRef.current = { wheelStep, currentValue, onWheelStep };

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) {
        return;
      }
      event.preventDefault();
      const state = stateRef.current;
      const base = Number.isFinite(state.currentValue) ? state.currentValue : 0;
      const direction = event.deltaY < 0 ? 1 : -1;
      const next = Number((base + direction * state.wheelStep).toFixed(stepDecimals(state.wheelStep)));
      state.onWheelStep(next);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  return <input ref={ref} type="number" step={wheelStep} {...inputProps} />;
}

type DynamicInputEditorViewProps = {
  controls: DynamicInputControl[];
  sections: DynamicInputSection[];
  isActive?: boolean;
  sectionNamesByCategory?: Record<string, string>;
  nameValidationErrorsByControlId?: Record<string, string>;
  sectionColumnByCategory: Record<string, "left" | "right">;
  columnsSplitRatio: number;
  warnings: DynamicInputWarning[];
  draftValues: DynamicInputDraftValues;
  hasDraftDiffFromTemplate: boolean;
  hasUnsavedChangesSinceLastRun: boolean;
  inlineErrorsByControlId: Record<string, string>;
  runBlockingMessage: string | null;
  setValue: (controlId: string, value: DynamicInputValue) => void;
  moveSection: (category: string, direction: "up" | "down") => void;
  toggleSectionColumn: (category: string) => void;
  setColumnsSplitRatio: (ratio: number) => void;
  resetToTemplateDefaults: () => void | Promise<void>;
  onRun: () => void;
};

function formatWarning(warning: DynamicInputWarning): string {
  return warning.message;
}

function copyVariableToClipboard(value: string): void {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === "undefined") {
    return;
  }

  const fallback = document.createElement("textarea");
  fallback.value = value;
  fallback.setAttribute("readonly", "true");
  fallback.style.position = "fixed";
  fallback.style.left = "-9999px";
  document.body.appendChild(fallback);
  fallback.select();
  document.execCommand("copy");
  document.body.removeChild(fallback);
}

function renderVariableLinks(
  control: DynamicInputControl,
  sectionName: string | undefined,
  hasCategoryName: boolean
 ) {
  if (!hasCategoryName || isNameField(control)) {
    return null;
  }

  const trimmedSectionName = sectionName?.trim();
  const tokens = buildVariableTokenParts(control, trimmedSectionName);
  const showNamed = Boolean(trimmedSectionName);

  return (
    <span className="field-variable-links">
      {showNamed && tokens.named ? (
        <button
          type="button"
          className="input-variable-link"
          title={`Copy ${tokens.named}`}
          aria-label={`Copy ${tokens.named}`}
          onClick={() => copyVariableToClipboard(tokens.named ?? tokens.generic)}
        >
          {tokens.named}
        </button>
      ) : null}
      <button
        type="button"
        className="input-variable-link"
        title={`Copy ${tokens.generic}`}
        aria-label={`Copy ${tokens.generic}`}
        onClick={() => copyVariableToClipboard(tokens.generic)}
      >
        {tokens.generic}
      </button>
    </span>
  );
}

function findImg2ImgControl(controls: DynamicInputControl[]): DynamicInputControl | null {
  for (const control of controls) {
    if (control.kind !== "image") {
      continue;
    }
    const haystack = `${control.name} ${control.category} ${control.fullTitle}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (haystack.includes("img2img")) {
      return control;
    }
  }
  return null;
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
    case "number": {
      const numericValue = typeof value === "number" ? value : Number(value);
      return (
        <WheelNumberInput
          className={className}
          wheelStep={resolveNumberStep(control)}
          currentValue={Number.isFinite(numericValue) ? numericValue : 0}
          onWheelStep={(next) => setValue(control.id, next)}
          value={typeof value === "number" || typeof value === "string" ? value : ""}
          onChange={(event) => {
            const rawValue = event.target.value;
            if (rawValue === "") {
              setValue(control.id, "");
              return;
            }

            if (!/^-?\d*(\.\d+)?$/.test(rawValue)) {
              return;
            }

            const parsed = Number(rawValue);
            if (Number.isFinite(parsed)) {
              setValue(control.id, parsed);
            }
          }}
        />
      );
    }
    case "boolean":
      return (
        <input
          className={hasInlineError ? "interactive input-invalid input-boolean-control" : "interactive input-boolean-control"}
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
            <WheelNumberInput
              className={className}
              wheelStep={1}
              currentValue={dimensions.width}
              onWheelStep={(next) => setValue(control.id, { width: next, height: dimensions.height })}
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
            <WheelNumberInput
              className={className}
              wheelStep={1}
              currentValue={dimensions.height}
              onWheelStep={(next) => setValue(control.id, { width: dimensions.width, height: next })}
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
          {imageValue ? <img alt={`${control.name} preview`} src={toImageDataUrl(imageValue)} width={128} /> : null}
        </div>
      );
    }
    case "lora-row": {
      const loraValue =
        value && typeof value === "object" && "enabled" in value && "loraName" in value && "strength" in value
          ? (value as { enabled: boolean; loraName: string; strength: number })
          : { enabled: false, loraName: control.name, strength: 0 };

      const sliderMin = 0;
      const sliderMax = 2;
      const sliderStep = 0.05;

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
              <WheelNumberInput
                id={`${control.id}-strength`}
                className={className}
                wheelStep={sliderStep}
                currentValue={loraValue.strength}
                onWheelStep={(next) =>
                  setValue(control.id, {
                    ...loraValue,
                    strength: next
                  })
                }
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
            min={sliderMin}
            max={sliderMax}
            step={sliderStep}
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
  const [showDetailerHint, setShowDetailerHint] = useState(false);
  const [animateDetailerLoraRows, setAnimateDetailerLoraRows] = useState(false);
  const [collapsedByCategory, setCollapsedByCategory] = useState<Record<string, boolean>>({});
  const [categoryToFollow, setCategoryToFollow] = useState<string | null>(null);
  const [isResizingColumns, setIsResizingColumns] = useState(false);
  const previousDetailerLorasEnabled = useRef<boolean>(true);
  const categoryRefs = useRef<Record<string, HTMLFieldSetElement | null>>({});
  const controlRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const columnsContainerRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const sectionNamesByCategory = props.sectionNamesByCategory ?? {};
  const nameValidationErrorsByControlId = props.nameValidationErrorsByControlId ?? {};
  const categoriesWithName = useMemo(() => getCategoriesWithName(props.controls), [props.controls]);
  const trackedCategories = useTrackedInputCategories();
  const [nextCategoryAtBottom, setNextCategoryAtBottom] = useState<string | null>(null);
  const [nextControlAtBottom, setNextControlAtBottom] = useState<{ id: string; name: string } | null>(null);
  const inlineErrorsByControlId = {
    ...props.inlineErrorsByControlId,
    ...nameValidationErrorsByControlId
  };

  const controlsById = new Map(props.controls.map((control) => [control.id, control]));
  const visibleSections = props.sections
    .map((section) => ({
      category: section.category,
      controls: section.controlIds
        .map((controlId) => controlsById.get(controlId))
        .filter((control): control is DynamicInputControl => Boolean(control))
    }))
    .filter((section) => section.controls.length > 0);
  const sectionIndexByCategory = new Map(visibleSections.map((section, index) => [section.category, index]));
  const leftColumnSections = visibleSections.filter(
    (section) => (props.sectionColumnByCategory[section.category] ?? "left") === "left"
  );
  const rightColumnSections = visibleSections.filter(
    (section) => (props.sectionColumnByCategory[section.category] ?? "left") === "right"
  );
  const detailerLoraMasterControl = props.controls.find(
    (control) =>
      control.kind === "boolean" &&
      control.category === "Detailer" &&
      /use different detailer loras\?/i.test(control.name)
  );

  const detailerLorasEnabled =
    !detailerLoraMasterControl ||
    Boolean(
      props.draftValues[detailerLoraMasterControl.id] ?? detailerLoraMasterControl.defaultValue
    );
  const visibleControlEntries = useMemo(
    () =>
      visibleSections.flatMap((section) =>
        section.controls
          .filter(
            (control) =>
              !(
                section.category === "Detailer" &&
                control.kind === "lora-row" &&
                !detailerLorasEnabled
              )
          )
          .map((control) => ({ id: control.id, name: control.name }))
      ),
    [detailerLorasEnabled, visibleSections]
  );
  const showTwoColumns = rightColumnSections.length > 0;

  function toggleDetailerHintForMobile(): void {
    if (typeof window === "undefined") {
      return;
    }

    if (!window.matchMedia("(max-width: 720px)").matches) {
      return;
    }

    setShowDetailerHint((previous) => !previous);
  }

  useEffect(() => {
    const wasEnabled = previousDetailerLorasEnabled.current;
    previousDetailerLorasEnabled.current = detailerLorasEnabled;

    if (!wasEnabled && detailerLorasEnabled) {
      setAnimateDetailerLoraRows(true);
      const timerId = window.setTimeout(() => {
        setAnimateDetailerLoraRows(false);
      }, 280);

      return () => {
        window.clearTimeout(timerId);
      };
    }

    return undefined;
  }, [detailerLorasEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const next: Record<string, boolean> = {};
    for (const section of visibleSections) {
      next[section.category] = collapsedByCategory[section.category] ?? false;
    }
    setCollapsedByCategory(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.sections]);

  useEffect(() => {
    if (!categoryToFollow || typeof window === "undefined") {
      return;
    }

    const fieldset = categoryRefs.current[categoryToFollow];
    if (!fieldset) {
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    fieldset.scrollIntoView({
      block: "nearest",
      behavior: prefersReducedMotion ? "auto" : "smooth"
    });

    setCategoryToFollow(null);
  }, [categoryToFollow, props.sections]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 720px)");

    const updateNextStickyTargets = () => {
      if (!mediaQuery.matches) {
        setNextCategoryAtBottom(null);
        setNextControlAtBottom(null);
        return;
      }

      const viewportBottom = window.innerHeight;
      const navBar = document.querySelector<HTMLElement>(".bottom-tab-nav");
      const navBarHeight = navBar?.offsetHeight ?? 0;
      const stickyBarHeight = rootRef.current?.querySelector<HTMLElement>(".input-next-sticky-bar")?.offsetHeight ?? 0;
      const visibleBottom = Math.max(0, viewportBottom - navBarHeight - stickyBarHeight);
      let nextCategory: string | null = null;
      let nextCategoryTop = Number.POSITIVE_INFINITY;

      for (const section of visibleSections) {
        const fieldset = categoryRefs.current[section.category];
        if (!fieldset) {
          continue;
        }

        const top = fieldset.getBoundingClientRect().top;
        if (top > visibleBottom && top < nextCategoryTop) {
          nextCategory = section.category;
          nextCategoryTop = top;
        }
      }

      let nextControl: { id: string; name: string } | null = null;
      let nextControlTop = Number.POSITIVE_INFINITY;
      for (const control of visibleControlEntries) {
        const row = controlRowRefs.current[control.id];
        if (!row) {
          continue;
        }

        const top = row.getBoundingClientRect().top;
        if (top > visibleBottom && top < nextControlTop) {
          nextControl = control;
          nextControlTop = top;
        }
      }

      setNextCategoryAtBottom(nextCategory);
      setNextControlAtBottom(nextControl);
    };

    let frameId = 0;
    const scheduleUpdate = () => {
      if (frameId) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        updateNextStickyTargets();
      });
    };

    updateNextStickyTargets();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    mediaQuery.addEventListener("change", scheduleUpdate);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      mediaQuery.removeEventListener("change", scheduleUpdate);
    };
  }, [visibleControlEntries, visibleSections]);

  useEffect(() => {
    if (!props.isActive || typeof window === "undefined") {
      return;
    }

    let frameId = 0;
    frameId = window.requestAnimationFrame(() => {
      const container = rootRef.current;
      if (!container) {
        return;
      }

      const textareas = container.querySelectorAll<HTMLTextAreaElement>("textarea.textarea");
      textareas.forEach((textarea) => {
        textarea.style.height = "auto";
        textarea.style.height = `${Math.max(textarea.scrollHeight, 96)}px`;
      });
    });

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [props.isActive]);

  useEffect(() => {
    if (!isResizingColumns || typeof window === "undefined") {
      return;
    }

    function onMouseMove(event: MouseEvent): void {
      const container = columnsContainerRef.current;
      if (!container) {
        return;
      }

      const bounds = container.getBoundingClientRect();
      if (bounds.width <= 0) {
        return;
      }

      const ratio = (event.clientX - bounds.left) / bounds.width;
      props.setColumnsSplitRatio(ratio);
    }

    function onMouseUp(): void {
      setIsResizingColumns(false);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizingColumns, props]);

  function toggleCategory(category: string): void {
    setCollapsedByCategory((previous) => ({
      ...previous,
      [category]: !previous[category]
    }));
  }

  function onMoveCategory(category: string, direction: "up" | "down"): void {
    setCategoryToFollow(category);
    props.moveSection(category, direction);
  }

  function onMoveCategoryToOtherColumn(category: string): void {
    setCategoryToFollow(category);
    props.toggleSectionColumn(category);
  }

  function scrollCategoryToStart(category: string): void {
    if (typeof window === "undefined") {
      return;
    }

    const fieldset = categoryRefs.current[category];
    if (!fieldset) {
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    fieldset.scrollIntoView({
      block: "start",
      behavior: prefersReducedMotion ? "auto" : "smooth"
    });
  }

  function scrollControlToStart(controlId: string): void {
    if (typeof window === "undefined") {
      return;
    }

    const row = controlRowRefs.current[controlId];
    if (!row) {
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({
      block: "start",
      behavior: prefersReducedMotion ? "auto" : "smooth"
    });
  }

  function renderCategorySection(section: {
    category: string;
    controls: DynamicInputControl[];
  }) {
    const { category, controls } = section;
    const sectionIndex = sectionIndexByCategory.get(category) ?? 0;

    return (
      <fieldset
        key={category}
        className="input-category"
        ref={(node) => {
          categoryRefs.current[category] = node;
        }}
      >
        <legend>
          <div className="input-category-header">
            <div className="input-category-title-group">
              <button
                type="button"
                className="btn btn-secondary input-category-icon-button"
                aria-expanded={!collapsedByCategory[category]}
                aria-label={`${collapsedByCategory[category] ? "Show" : "Hide"} ${category}`}
                onClick={() => toggleCategory(category)}
              >
                <span aria-hidden="true">{collapsedByCategory[category] ? "▸" : "▾"}</span>
              </button>
              <button
                type="button"
                className="input-sticky-title-button input-category-title"
                onClick={() => scrollCategoryToStart(category)}
                aria-label={`Scroll to start of ${category}`}
                title="Jump to category start"
              >
                {category}
              </button>
            </div>
            <div className="input-category-actions">
              <button
                type="button"
                className={`btn input-category-icon-button${trackedCategories.includes(category) ? " input-category-track-active" : " btn-secondary"}`}
                onClick={() => toggleCategoryTracked(category)}
                aria-pressed={trackedCategories.includes(category)}
                aria-label={`${trackedCategories.includes(category) ? "Stop tracking" : "Track"} ${category} in job outputs`}
                title="Show this category under job outputs"
              >
                <span aria-hidden="true">{trackedCategories.includes(category) ? "★" : "☆"}</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary input-category-icon-button"
                onClick={() => onMoveCategoryToOtherColumn(category)}
                aria-label={`Move ${category} to ${
                  (props.sectionColumnByCategory[category] ?? "left") === "left" ? "right" : "left"
                } column`}
              >
                <span aria-hidden="true">
                  {(props.sectionColumnByCategory[category] ?? "left") === "left" ? "⇢" : "⇠"}
                </span>
              </button>
              <button
                type="button"
                className="btn btn-secondary input-category-icon-button"
                onClick={() => onMoveCategory(category, "up")}
                disabled={sectionIndex === 0}
                aria-label={`Move ${category} up`}
              >
                <span aria-hidden="true">↑</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary input-category-icon-button"
                onClick={() => onMoveCategory(category, "down")}
                disabled={sectionIndex === visibleSections.length - 1}
                aria-label={`Move ${category} down`}
              >
                <span aria-hidden="true">↓</span>
              </button>
            </div>
          </div>
        </legend>
        {collapsedByCategory[category]
          ? null
          : controls
              .filter(
                (control) =>
                  !(
                    category === "Detailer" &&
                    control.kind === "lora-row" &&
                    !detailerLorasEnabled
                  )
              )
              .map((control) => (
          <div
            key={control.id}
            className={`input-row ${
              category === "Detailer" && control.kind === "lora-row" && animateDetailerLoraRows
                ? "input-row-lora-reveal"
                : ""
            }`}
            ref={(node) => {
              controlRowRefs.current[control.id] = node;
            }}
          >
            {control.kind === "boolean" ? (
              <>
                <div className="field-boolean-row">
                  <label className="field field-boolean">
                    {renderInputControl(
                      control,
                      props.draftValues,
                      props.setValue,
                      Boolean(inlineErrorsByControlId[control.id])
                    )}
                    <span>{control.name}</span>
                  </label>
                  {renderVariableLinks(control, sectionNamesByCategory[category], categoriesWithName.has(category))}
                  {detailerLoraMasterControl?.id === control.id ? (
                    <button
                      type="button"
                      className="input-inline-hint-button"
                      aria-label={'Toggle "Use Different Detailer Loras?" to show or hide detailer lora rows.'}
                      data-tooltip={'Toggle "Use Different Detailer Loras?" to show or hide detailer lora rows.'}
                      onClick={toggleDetailerHintForMobile}
                    >
                      info
                    </button>
                  ) : null}
                </div>
                {detailerLoraMasterControl?.id === control.id && showDetailerHint ? (
                  <p className="input-status input-inline-hint-mobile">
                    Toggle "Use Different Detailer Loras?" to show or hide detailer lora rows.
                  </p>
                ) : null}
              </>
            ) : (
              <label className="field">
                <span className="field-label-row">
                  <button
                    type="button"
                    className="input-sticky-title-button field-label-title"
                    onClick={() => scrollControlToStart(control.id)}
                    aria-label={`Scroll to start of ${control.name}`}
                    title="Jump to input start"
                  >
                    {control.name}
                  </button>
                </span>
                {renderVariableLinks(control, sectionNamesByCategory[category], categoriesWithName.has(category))}
                {renderInputControl(
                  control,
                  props.draftValues,
                  props.setValue,
                  Boolean(inlineErrorsByControlId[control.id])
                )}
              </label>
            )}
            {inlineErrorsByControlId[control.id] ? (
              <p role="alert" className="input-error">
                {inlineErrorsByControlId[control.id]}
              </p>
            ) : null}
          </div>
              ))}
      </fieldset>
    );
  }

  return (
    <section className="input-card" ref={rootRef}>
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

      {showTwoColumns ? (
        <div
          className="input-category-columns"
          ref={columnsContainerRef}
          style={{
            ["--input-left-column-width" as string]: `${props.columnsSplitRatio * 100}%`
          }}
        >
          <div className="input-category-column">{leftColumnSections.map((section) => renderCategorySection(section))}</div>
          <button
            type="button"
            className={`input-category-resizer${isResizingColumns ? " is-active" : ""}`}
            aria-label="Resize category columns"
            onMouseDown={(event) => {
              event.preventDefault();
              setIsResizingColumns(true);
            }}
          />
          <div className="input-category-column">{rightColumnSections.map((section) => renderCategorySection(section))}</div>
        </div>
      ) : (
        leftColumnSections.map((section) => renderCategorySection(section))
      )}

      {nextCategoryAtBottom || nextControlAtBottom ? (
        <div className="input-next-sticky-bar" aria-label="Next input shortcuts">
          {nextControlAtBottom ? (
            <span className="field-label-row">
              <button
                type="button"
                className="input-sticky-title-button field-label-title"
                onClick={() => scrollControlToStart(nextControlAtBottom.id)}
                aria-label={`Scroll to next input ${nextControlAtBottom.name}`}
                title="Jump to input start"
              >
                {nextControlAtBottom.name}
              </button>
            </span>
          ) : null}
          {nextCategoryAtBottom ? (
            <div className="input-next-sticky-category-row input-category-header">
              <div className="input-category-title-group">
                <button
                  type="button"
                  className="btn btn-secondary input-category-icon-button"
                  aria-expanded={!collapsedByCategory[nextCategoryAtBottom]}
                  aria-label={`${collapsedByCategory[nextCategoryAtBottom] ? "Show" : "Hide"} ${nextCategoryAtBottom}`}
                  onClick={() => toggleCategory(nextCategoryAtBottom)}
                >
                  <span aria-hidden="true">{collapsedByCategory[nextCategoryAtBottom] ? "▸" : "▾"}</span>
                </button>
                <button
                  type="button"
                  className="input-sticky-title-button input-category-title"
                  onClick={() => scrollCategoryToStart(nextCategoryAtBottom)}
                  aria-label={`Scroll to next category ${nextCategoryAtBottom}`}
                  title="Jump to category start"
                >
                  {nextCategoryAtBottom}
                </button>
              </div>
              <div className="input-category-actions">
                <button
                  type="button"
                  className={`btn input-category-icon-button${trackedCategories.includes(nextCategoryAtBottom) ? " input-category-track-active" : " btn-secondary"}`}
                  onClick={() => toggleCategoryTracked(nextCategoryAtBottom)}
                  aria-pressed={trackedCategories.includes(nextCategoryAtBottom)}
                  aria-label={`${trackedCategories.includes(nextCategoryAtBottom) ? "Stop tracking" : "Track"} ${nextCategoryAtBottom} in job outputs`}
                  title="Show this category under job outputs"
                >
                  <span aria-hidden="true">{trackedCategories.includes(nextCategoryAtBottom) ? "★" : "☆"}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary input-category-icon-button"
                  onClick={() => onMoveCategoryToOtherColumn(nextCategoryAtBottom)}
                  aria-label={`Move ${nextCategoryAtBottom} to ${
                    (props.sectionColumnByCategory[nextCategoryAtBottom] ?? "left") === "left" ? "right" : "left"
                  } column`}
                >
                  <span aria-hidden="true">
                    {(props.sectionColumnByCategory[nextCategoryAtBottom] ?? "left") === "left" ? "⇢" : "⇠"}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary input-category-icon-button"
                  onClick={() => onMoveCategory(nextCategoryAtBottom, "up")}
                  disabled={(sectionIndexByCategory.get(nextCategoryAtBottom) ?? 0) === 0}
                  aria-label={`Move ${nextCategoryAtBottom} up`}
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary input-category-icon-button"
                  onClick={() => onMoveCategory(nextCategoryAtBottom, "down")}
                  disabled={(sectionIndexByCategory.get(nextCategoryAtBottom) ?? 0) === visibleSections.length - 1}
                  aria-label={`Move ${nextCategoryAtBottom} down`}
                >
                  <span aria-hidden="true">↓</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <button className="btn btn-primary input-run-fab" type="button" onClick={props.onRun} aria-label="Run with current inputs">
        Run
      </button>
    </section>
  );
}

type DynamicInputEditorProps = {
  activeTemplate: WorkflowTemplateRecord;
  isActive?: boolean;
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
    applyImportedWorkflowInputs: (sourceWorkflowRawJson: unknown, selectedCategories: string[]) => Promise<{
      ok: true;
      draftValues: DynamicInputDraftValues;
      matchedControls: number;
      selectedCategories: string[];
    } | {
      ok: false;
      reason: string;
    }>;
    img2imgInputAvailable: boolean;
    setImg2ImgImage: (dataUrl: string) => boolean;
  }) => void;
};

export function DynamicInputEditor(props: DynamicInputEditorProps) {
  const editor = useDynamicInputEditor(props.activeTemplate);

  const img2imgControl = useMemo(() => findImg2ImgControl(editor.controls), [editor.controls]);

  useEffect(() => {
    props.onEditorReady?.({
      applyExternalDraftValues: editor.applyExternalDraft,
      applyImportedWorkflowInputs: editor.applyImportedWorkflowInputs,
      img2imgInputAvailable: img2imgControl !== null,
      setImg2ImgImage: (dataUrl: string) => {
        if (!img2imgControl) {
          return false;
        }
        editor.setValue(img2imgControl.id, { dataUrl });
        return true;
      }
    });
  }, [editor.applyExternalDraft, editor.applyImportedWorkflowInputs, editor.setValue, img2imgControl, props.onEditorReady]);

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
      sections={editor.sections}
      isActive={props.isActive}
      sectionNamesByCategory={editor.sectionNamesByCategory}
      nameValidationErrorsByControlId={editor.nameValidationErrorsByControlId}
      sectionColumnByCategory={editor.sectionColumnByCategory}
      columnsSplitRatio={editor.columnsSplitRatio}
      warnings={editor.warnings}
      draftValues={editor.draftValues}
      hasDraftDiffFromTemplate={editor.hasDraftDiffFromTemplate}
      hasUnsavedChangesSinceLastRun={editor.hasUnsavedChangesSinceLastRun}
      inlineErrorsByControlId={editor.inlineErrorsByControlId}
      runBlockingMessage={editor.runBlockingMessage}
      setValue={editor.setValue}
      moveSection={editor.moveSection}
      toggleSectionColumn={editor.toggleSectionColumn}
      setColumnsSplitRatio={editor.setColumnsSplitRatio}
      resetToTemplateDefaults={editor.resetToTemplateDefaults}
      onRun={onRun}
    />
  );
}
