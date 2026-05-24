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

function buildDefaultDraftValues(controls: DynamicInputControl[]): DynamicInputDraftValues {
  const defaults: DynamicInputDraftValues = {};

  for (const control of controls) {
    defaults[control.id] = control.defaultValue;
  }

  return defaults;
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
        orderByControlId: {
          ...previous.orderByControlId,
          [controlId]: position
        }
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
    resetToTemplateDefaults,
    attemptRun,
    hasDraftDiffFromTemplate: hasDraftDiffFromDefaults(derivation.controls, draftValues)
  };
}
