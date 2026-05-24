import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DynamicInputControl,
  DynamicInputDraftValues,
  DynamicInputOrderingOverlay,
  DynamicInputSection,
  DynamicInputValue
} from "../../../shared/contracts/inputs";
import type { WorkflowTemplateRecord } from "../../../shared/contracts/workflow";
import { deriveInputControls } from "../../../shared/workflow/deriveInputControls";
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

export function useDynamicInputEditor(activeTemplate: WorkflowTemplateRecord | null) {
  const [draftValues, setDraftValues] = useState<DynamicInputDraftValues>({});
  const [overlay, setOverlay] = useState<DynamicInputOrderingOverlay>({ orderByControlId: {} });
  const [showSourceMapping, setShowSourceMapping] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);

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

      setDraftValues((previous) => {
        const next = {
          ...previous,
          [controlId]: value
        };

        void saveInputDraftValues(activeTemplate.fingerprint, next);
        return next;
      });
    },
    [activeTemplate]
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

  return {
    controls: orderedControls,
    sections: orderedSections,
    warnings: derivation.warnings,
    draftValues,
    isLoadingDraft,
    showSourceMapping,
    setShowSourceMapping,
    setValue,
    setOverlayPosition,
    resetToTemplateDefaults,
    hasDraftDiffFromTemplate: hasDraftDiffFromDefaults(derivation.controls, draftValues)
  };
}
