import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DynamicInputControl,
  DynamicInputDraftValues,
  DynamicInputInlineError,
  DynamicInputOrderingOverlay,
  DynamicInputSection,
  DynamicInputValue
} from "../../../shared/contracts/inputs";
import type { WorkflowTemplateRecord } from "../../../shared/contracts/workflow";
import { buildRunWorkflowPayload } from "../../../shared/workflow/buildRunWorkflowPayload";
import { deriveInputControls } from "../../../shared/workflow/deriveInputControls";
import {
  shouldPersistDraftValue,
  validateDraftForRun,
  validateInlineControl
} from "../../../shared/workflow/validateInputDraft";
import {
  clearInputDraftValues,
  getInputDraftValues,
  getInputOrderingOverlay,
  saveInputDraftValues,
  saveInputOrderingOverlay
} from "../../lib/inputEditorStorage";
import {
  deriveSectionNamesByCategory,
  validateSectionNames
} from "./inputVariables";

const DEFAULT_COLUMNS_SPLIT_RATIO = 0.5;
const MIN_COLUMNS_SPLIT_RATIO = 0.3;
const MAX_COLUMNS_SPLIT_RATIO = 0.7;

function clampColumnsSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return DEFAULT_COLUMNS_SPLIT_RATIO;
  }

  return Math.min(MAX_COLUMNS_SPLIT_RATIO, Math.max(MIN_COLUMNS_SPLIT_RATIO, ratio));
}

function buildDefaultDraftValues(controls: DynamicInputControl[]): DynamicInputDraftValues {
  const defaults: DynamicInputDraftValues = {};

  for (const control of controls) {
    defaults[control.id] = control.defaultValue;
  }

  return defaults;
}

export type ExternalDraftApplyResult =
  | {
      ok: true;
      draftValues: DynamicInputDraftValues;
    }
  | {
      ok: false;
      reason: string;
    };

export type ImportedWorkflowInputsApplyResult =
  | {
      ok: true;
      draftValues: DynamicInputDraftValues;
      matchedControls: number;
      selectedCategories: string[];
    }
  | {
      ok: false;
      reason: string;
    };

function normalizeCategory(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeControlName(value: string): string {
  return value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function isCompatibleKind(left: DynamicInputControl["kind"], right: DynamicInputControl["kind"]): boolean {
  if (left === right) {
    return true;
  }

  return (left === "text" && right === "multiline") || (left === "multiline" && right === "text");
}

function isMeaningfulImportedValue(value: DynamicInputValue): boolean {
  if (value === null) {
    return false;
  }

  if (typeof value === "string") {
    // An empty string is a valid value to carry over: it should overwrite the
    // target input (e.g. clearing a prompt), not be skipped.
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value === "boolean") {
    return true;
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  if ("dataUrl" in value) {
    return typeof value.dataUrl === "string" && value.dataUrl.trim().length > 0;
  }

  if ("width" in value && "height" in value) {
    return Number.isFinite(Number(value.width)) && Number.isFinite(Number(value.height));
  }

  if ("enabled" in value && "loraName" in value && "strength" in value) {
    return typeof value.loraName === "string" && value.loraName.trim().length > 0 && Number.isFinite(Number(value.strength));
  }

  return false;
}

function getWorkflowSource(rawJson: unknown): unknown {
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

function scoreControlMatch(source: DynamicInputControl, target: DynamicInputControl): number {
  if (!isCompatibleKind(source.kind, target.kind)) {
    return -1;
  }

  let score = source.kind === target.kind ? 30 : 22;
  const sourceName = normalizeControlName(source.name);
  const targetName = normalizeControlName(target.name);

  if (sourceName && sourceName === targetName) {
    score += 40;
  }

  if (normalizeCategory(source.category) === normalizeCategory(target.category)) {
    score += 10;
  }

  if (source.source.valuePath[0] && target.source.valuePath[0] && source.source.valuePath[0] === target.source.valuePath[0]) {
    score += 8;
  }

  if (source.fullTitle === target.fullTitle) {
    score += 5;
  }

  return score;
}

function buildImportedWorkflowDraftValues(args: {
  currentControls: DynamicInputControl[];
  currentDraftValues: DynamicInputDraftValues;
  sourceControls: DynamicInputControl[];
  selectedCategories: string[];
}): {
  draftValues: DynamicInputDraftValues;
  matchedControls: number;
} {
  const selectedCategorySet = new Set(args.selectedCategories.map(normalizeCategory));
  const selectedSourceControls = args.sourceControls.filter((control) => selectedCategorySet.has(normalizeCategory(control.category)));

  const nextDraftValues: DynamicInputDraftValues = {
    ...args.currentDraftValues
  };
  const usedTargetControlIds = new Set<string>();
  let matchedControls = 0;

  for (const sourceControl of selectedSourceControls) {
    const sourceValue = sourceControl.defaultValue;
    if (!isMeaningfulImportedValue(sourceValue)) {
      continue;
    }

    let bestTarget: DynamicInputControl | null = null;
    let bestScore = -1;

    for (const targetControl of args.currentControls) {
      if (usedTargetControlIds.has(targetControl.id)) {
        continue;
      }

      const score = scoreControlMatch(sourceControl, targetControl);
      if (score > bestScore) {
        bestTarget = targetControl;
        bestScore = score;
      }
    }

    if (!bestTarget || bestScore < 0) {
      continue;
    }

    const validation = validateInlineControl(bestTarget, sourceValue);
    if (!validation.valid) {
      continue;
    }

    nextDraftValues[bestTarget.id] = sourceValue;
    usedTargetControlIds.add(bestTarget.id);
    matchedControls += 1;
  }

  return {
    draftValues: nextDraftValues,
    matchedControls
  };
}

export function applyExternalDraftValues(args: {
  currentTemplateFingerprint: string;
  sourceTemplateFingerprint: string;
  controls: DynamicInputControl[];
  externalDraftValues: DynamicInputDraftValues;
}): ExternalDraftApplyResult {
  if (args.currentTemplateFingerprint !== args.sourceTemplateFingerprint) {
    return {
      ok: false,
      reason: "Workflow template mismatch."
    };
  }

  return {
    ok: true,
    draftValues: {
      ...buildDefaultDraftValues(args.controls),
      ...args.externalDraftValues
    }
  };
}

export function applyImportedWorkflowInputs(args: {
  sourceWorkflowRawJson: unknown;
  selectedCategories: string[];
  currentDraftValues: DynamicInputDraftValues;
  currentControls: DynamicInputControl[];
}): ImportedWorkflowInputsApplyResult {
  if (args.selectedCategories.length === 0) {
    return {
      ok: false,
      reason: "Select at least one input category to import."
    };
  }

  const sourceWorkflow = getWorkflowSource(args.sourceWorkflowRawJson);
  const sourceDerivation = deriveInputControls(sourceWorkflow);

  if (sourceDerivation.controls.length === 0) {
    return {
      ok: false,
      reason: "No importable inputs were found in the source workflow."
    };
  }

  const imported = buildImportedWorkflowDraftValues({
    currentControls: args.currentControls,
    currentDraftValues: args.currentDraftValues,
    sourceControls: sourceDerivation.controls,
    selectedCategories: args.selectedCategories
  });

  return {
    ok: true,
    draftValues: imported.draftValues,
    matchedControls: imported.matchedControls,
    selectedCategories: [...args.selectedCategories]
  };
}

function valueEquals(left: DynamicInputValue, right: DynamicInputValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasDraftDiffFromDefaults(controls: DynamicInputControl[], draftValues: DynamicInputDraftValues): boolean {
  for (const control of controls) {
    if (!valueEquals(control.defaultValue, draftValues[control.id] ?? null)) {
      return true;
    }
  }

  return false;
}

export function applyOrderingOverlay(
  controls: DynamicInputControl[],
  overlay: DynamicInputOrderingOverlay
): DynamicInputControl[] {
  const knownIds = new Set(controls.map((control) => control.id));

  const overlayEntries = Object.entries(overlay.orderByControlId)
    .filter(([controlId]) => knownIds.has(controlId))
    .sort((left, right) => left[1] - right[1]);

  const overlayOrderedIds = overlayEntries.map(([controlId]) => controlId);
  const overlayIdSet = new Set(overlayOrderedIds);
  const newControls = controls.filter((control) => !overlayIdSet.has(control.id));

  return [
    ...overlayOrderedIds
      .map((controlId) => controls.find((control) => control.id === controlId))
      .filter((control): control is DynamicInputControl => Boolean(control)),
    ...newControls
  ];
}

export function buildSectionsFromControls(orderedControls: DynamicInputControl[]): DynamicInputSection[] {
  const sectionMap = new Map<string, string[]>();

  for (const control of orderedControls) {
    const list = sectionMap.get(control.category);
    if (list) {
      list.push(control.id);
      continue;
    }

    sectionMap.set(control.category, [control.id]);
  }

  return [...sectionMap.entries()].map(([category, controlIds]) => ({
    category,
    controlIds
  }));
}

export function buildOverlayForSectionOrder(args: {
  orderedSections: DynamicInputSection[];
  controls: DynamicInputControl[];
}): DynamicInputOrderingOverlay {
  const controlIdsBySection = new Map(args.orderedSections.map((section) => [section.category, section.controlIds]));
  const flattenedControlIds = args.orderedSections.flatMap((section) => controlIdsBySection.get(section.category) ?? []);
  const validControlIds = new Set(args.controls.map((control) => control.id));

  return {
    orderByControlId: flattenedControlIds.reduce<Record<string, number>>((accumulator, controlId, index) => {
      if (validControlIds.has(controlId)) {
        accumulator[controlId] = index;
      }
      return accumulator;
    }, {})
  };
}

export type RunAttemptResult =
  | {
      ok: true;
      payload: Record<string, unknown>;
      errors: DynamicInputInlineError[];
    }
  | {
      ok: false;
      errors: DynamicInputInlineError[];
      blockingMessage: string;
    };

export function attemptRunFromEditorState(args: {
  controls: DynamicInputControl[];
  draftValues: DynamicInputDraftValues;
  templateRawJson: unknown;
}): RunAttemptResult {
  const runValidation = validateDraftForRun(args.controls, args.draftValues);
  if (!runValidation.valid) {
    return {
      ok: false,
      errors: runValidation.errors,
      blockingMessage: runValidation.blockingMessage ?? "Fix invalid inputs before running."
    };
  }

  const buildResult = buildRunWorkflowPayload({
    templateRawJson: args.templateRawJson,
    controls: args.controls,
    draftValues: args.draftValues
  });

  if (!buildResult.ok) {
    return {
      ok: false,
      errors: buildResult.errors,
      blockingMessage: "Fix highlighted inputs before running the workflow."
    };
  }

  return {
    ok: true,
    payload: buildResult.payload,
    errors: []
  };
}

export function useDynamicInputEditor(activeTemplate: WorkflowTemplateRecord | null) {
  const [draftValues, setDraftValues] = useState<DynamicInputDraftValues>({});
  const [overlay, setOverlay] = useState<DynamicInputOrderingOverlay>({ orderByControlId: {} });
  const [showSourceMapping, setShowSourceMapping] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [inlineErrorsByControlId, setInlineErrorsByControlId] = useState<Record<string, string>>({});
  const [runBlockingMessage, setRunBlockingMessage] = useState<string | null>(null);
  const [lastSuccessfulRunDraft, setLastSuccessfulRunDraft] = useState<DynamicInputDraftValues | null>(null);

  const derivation = useMemo(() => {
    if (!activeTemplate) {
      return {
        controls: [],
        sections: [],
        warnings: []
      };
    }

    return deriveInputControls(activeTemplate.rawJson);
  }, [activeTemplate]);

  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      if (!activeTemplate) {
        setDraftValues({});
        return;
      }

      setIsLoadingDraft(true);

      const [storedDraft, storedOverlay] = await Promise.all([
        getInputDraftValues(activeTemplate.fingerprint),
        getInputOrderingOverlay()
      ]);

      if (!mounted) {
        return;
      }

      const defaults = buildDefaultDraftValues(derivation.controls);
      setDraftValues(storedDraft ? { ...defaults, ...storedDraft } : defaults);
      setOverlay(storedOverlay);
      setInlineErrorsByControlId({});
      setRunBlockingMessage(null);
      setLastSuccessfulRunDraft(null);
      setIsLoadingDraft(false);
    }

    void hydrate();

    return () => {
      mounted = false;
    };
  }, [activeTemplate, derivation.controls]);

  const orderedControls = useMemo(() => applyOrderingOverlay(derivation.controls, overlay), [derivation.controls, overlay]);
  const orderedSections = useMemo(() => buildSectionsFromControls(orderedControls), [orderedControls]);
  const sectionNamesByCategory = useMemo(
    () => deriveSectionNamesByCategory(orderedControls, draftValues),
    [draftValues, orderedControls]
  );
  const nameValidationErrorsByControlId = useMemo(
    () => validateSectionNames(orderedControls, draftValues),
    [draftValues, orderedControls]
  );

  const setValue = useCallback(
    (controlId: string, value: DynamicInputValue) => {
      if (!activeTemplate) {
        return;
      }

      const control = derivation.controls.find((candidate) => candidate.id === controlId);
      if (!control) {
        return;
      }

      const validation = validateInlineControl(control, value);
      setInlineErrorsByControlId((previous) => {
        const next = { ...previous };
        if (validation.valid) {
          delete next[controlId];
        } else {
          next[controlId] = validation.errors[0]?.message ?? "Invalid value.";
        }
        return next;
      });

      if (validation.valid) {
        setRunBlockingMessage(null);
      }

      setDraftValues((previous) => {
        const next = {
          ...previous,
          [controlId]: value
        };

        if (shouldPersistDraftValue(control, value)) {
          void saveInputDraftValues(activeTemplate.fingerprint, next);
        }
        return next;
      });
    },
    [activeTemplate, derivation.controls]
  );

  const setOverlayPosition = useCallback((controlId: string, position: number) => {
    setOverlay((previous) => {
      const next = {
        ...previous,
        orderByControlId: {
          ...previous.orderByControlId,
          [controlId]: position
        }
      };

      void saveInputOrderingOverlay(next);
      return next;
    });
  }, []);

  const moveSection = useCallback(
    (category: string, direction: "up" | "down") => {
      const index = orderedSections.findIndex((section) => section.category === category);
      if (index < 0) {
        return;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= orderedSections.length) {
        return;
      }

      const reorderedSections = [...orderedSections];
      const [movedSection] = reorderedSections.splice(index, 1);
      reorderedSections.splice(targetIndex, 0, movedSection);

      const nextOverlay = buildOverlayForSectionOrder({
        orderedSections: reorderedSections,
        controls: orderedControls
      });

      const mergedOverlay = {
        ...overlay,
        ...nextOverlay,
        sectionColumnByCategory: {
          ...(overlay.sectionColumnByCategory ?? {})
        },
        columnsSplitRatio: clampColumnsSplitRatio(overlay.columnsSplitRatio ?? DEFAULT_COLUMNS_SPLIT_RATIO)
      };

      setOverlay(mergedOverlay);
      void saveInputOrderingOverlay(mergedOverlay);
    },
    [orderedControls, orderedSections, overlay]
  );

  const toggleSectionColumn = useCallback(
    (category: string) => {
      const knownCategories = new Set(orderedSections.map((section) => section.category));
      if (!knownCategories.has(category)) {
        return;
      }

      setOverlay((previous) => {
        const currentColumn = previous.sectionColumnByCategory?.[category] ?? "left";
        const nextColumn = currentColumn === "left" ? "right" : "left";
        const sectionColumnByCategory: Record<string, "left" | "right"> = {
          ...(previous.sectionColumnByCategory ?? {}),
          [category]: nextColumn
        };
        const next = {
          ...previous,
          sectionColumnByCategory,
          columnsSplitRatio: clampColumnsSplitRatio(previous.columnsSplitRatio ?? DEFAULT_COLUMNS_SPLIT_RATIO)
        };

        void saveInputOrderingOverlay(next);
        return next;
      });
    },
    [orderedSections]
  );

  const setColumnsSplitRatio = useCallback((ratio: number) => {
    setOverlay((previous) => {
      const next = {
        ...previous,
        columnsSplitRatio: clampColumnsSplitRatio(ratio)
      };

      void saveInputOrderingOverlay(next);
      return next;
    });
  }, []);

  const resetToTemplateDefaults = useCallback(async () => {
    if (!activeTemplate) {
      return;
    }

    const defaults = buildDefaultDraftValues(derivation.controls);
    setDraftValues(defaults);
    await clearInputDraftValues(activeTemplate.fingerprint);
  }, [activeTemplate, derivation.controls]);

  const applyExternalDraft = useCallback(
    async (sourceTemplateFingerprint: string, externalDraftValues: DynamicInputDraftValues) => {
      if (!activeTemplate) {
        return {
          ok: false as const,
          reason: "No active template loaded."
        };
      }

      const result = applyExternalDraftValues({
        currentTemplateFingerprint: activeTemplate.fingerprint,
        sourceTemplateFingerprint,
        controls: derivation.controls,
        externalDraftValues
      });

      if (!result.ok) {
        return result;
      }

      const nextDraftValues = result.draftValues;
      const nextInlineErrors = derivation.controls.reduce<Record<string, string>>((accumulator, control) => {
        const validation = validateInlineControl(control, nextDraftValues[control.id] ?? control.defaultValue);
        if (!validation.valid) {
          accumulator[control.id] = validation.errors[0]?.message ?? "Invalid value.";
        }
        return accumulator;
      }, {});

      setDraftValues(nextDraftValues);
      setInlineErrorsByControlId(nextInlineErrors);
      setRunBlockingMessage(null);
      setLastSuccessfulRunDraft(nextDraftValues);
      await saveInputDraftValues(activeTemplate.fingerprint, nextDraftValues);

      return {
        ok: true as const,
        draftValues: nextDraftValues
      };
    },
    [activeTemplate, derivation.controls]
  );

  const applyImportedWorkflowInputsToDraft = useCallback(
    async (sourceWorkflowRawJson: unknown, selectedCategories: string[]) => {
      if (!activeTemplate) {
        return {
          ok: false as const,
          reason: "No active template loaded."
        };
      }

      const result = applyImportedWorkflowInputs({
        sourceWorkflowRawJson,
        selectedCategories,
        currentDraftValues: draftValues,
        currentControls: derivation.controls
      });

      if (!result.ok) {
        return result;
      }

      const nextDraftValues = result.draftValues;
      const nextInlineErrors = derivation.controls.reduce<Record<string, string>>((accumulator, control) => {
        const validation = validateInlineControl(control, nextDraftValues[control.id] ?? control.defaultValue);
        if (!validation.valid) {
          accumulator[control.id] = validation.errors[0]?.message ?? "Invalid value.";
        }
        return accumulator;
      }, {});

      setDraftValues(nextDraftValues);
      setInlineErrorsByControlId(nextInlineErrors);
      setRunBlockingMessage(null);
      setLastSuccessfulRunDraft(nextDraftValues);
      await saveInputDraftValues(activeTemplate.fingerprint, nextDraftValues);

      return {
        ok: true as const,
        draftValues: nextDraftValues,
        matchedControls: result.matchedControls,
        selectedCategories: result.selectedCategories
      };
    },
    [activeTemplate, derivation.controls, draftValues]
  );

  const attemptRun = useCallback((): RunAttemptResult => {
    if (!activeTemplate) {
      return {
        ok: false,
        errors: [
          {
            controlId: "workflow",
            message: "No active template loaded."
          }
        ],
        blockingMessage: "Load a workflow template before running."
      };
    }

    const result = attemptRunFromEditorState({
      controls: derivation.controls,
      draftValues,
      templateRawJson: activeTemplate.rawJson
    });

    if (!result.ok) {
      setInlineErrorsByControlId(
        result.errors.reduce<Record<string, string>>((accumulator, error) => {
          accumulator[error.controlId] = error.message;
          return accumulator;
        }, {})
      );
      setRunBlockingMessage(result.blockingMessage);
      return result;
    }

    setInlineErrorsByControlId({});
    setRunBlockingMessage(null);
    setLastSuccessfulRunDraft(draftValues);

    return result;
  }, [activeTemplate, derivation.controls, draftValues]);

  const hasUnsavedChangesSinceLastRun = useMemo(() => {
    if (!lastSuccessfulRunDraft) {
      return false;
    }

    const allControlIds = new Set([
      ...Object.keys(lastSuccessfulRunDraft),
      ...Object.keys(draftValues)
    ]);

    for (const controlId of allControlIds) {
      if (JSON.stringify(lastSuccessfulRunDraft[controlId] ?? null) !== JSON.stringify(draftValues[controlId] ?? null)) {
        return true;
      }
    }

    return false;
  }, [draftValues, lastSuccessfulRunDraft]);

  return {
    controls: orderedControls,
    sections: orderedSections,
    sectionNamesByCategory,
    nameValidationErrorsByControlId,
    sectionColumnByCategory: overlay.sectionColumnByCategory ?? {},
    columnsSplitRatio: clampColumnsSplitRatio(overlay.columnsSplitRatio ?? DEFAULT_COLUMNS_SPLIT_RATIO),
    warnings: derivation.warnings,
    draftValues,
    isLoadingDraft,
    showSourceMapping,
    setShowSourceMapping,
    inlineErrorsByControlId,
    runBlockingMessage,
    hasUnsavedChangesSinceLastRun,
    setValue,
    setOverlayPosition,
    moveSection,
    toggleSectionColumn,
    setColumnsSplitRatio,
    resetToTemplateDefaults,
    applyExternalDraft,
    applyImportedWorkflowInputs: applyImportedWorkflowInputsToDraft,
    attemptRun,
    hasDraftDiffFromTemplate: hasDraftDiffFromDefaults(derivation.controls, draftValues)
  };
}
