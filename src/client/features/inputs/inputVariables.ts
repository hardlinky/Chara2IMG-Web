import type { DynamicInputControl, DynamicInputDraftValues } from "../../../shared/contracts/inputs";
import {
  deriveSectionNamesByCategory,
  isNameControl,
  toVariableSegment
} from "../../../shared/workflow/inputTokens";

export { deriveSectionNamesByCategory };

function toDraftText(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

export function buildVariableTokenParts(control: DynamicInputControl, sectionName?: string): {
  named: string | null;
  generic: string;
} {
  const fieldSegment = toVariableSegment(control.name);
  const generic = `{${toVariableSegment(control.category)}.${fieldSegment}}`;
  const named = sectionName ? `{${toVariableSegment(sectionName)}.${fieldSegment}}` : null;

  return {
    named,
    generic
  };
}

export function getCategoriesWithName(controls: DynamicInputControl[]): Set<string> {
  const categories = new Set<string>();
  for (const control of controls) {
    if (isNameControl(control)) {
      categories.add(control.category);
    }
  }
  return categories;
}

export function validateSectionNames(
  controls: DynamicInputControl[],
  draftValues: DynamicInputDraftValues
): Record<string, string> {
  const errorsByControlId: Record<string, string> = {};
  const nameControls = controls.filter(isNameControl);
  const seen = new Map<string, DynamicInputControl[]>();

  for (const control of nameControls) {
    const candidate = toDraftText(draftValues[control.id] ?? control.defaultValue);
    if (!candidate) {
      errorsByControlId[control.id] = `${control.category} Name is required.`;
      continue;
    }

    const list = seen.get(candidate);
    if (list) {
      list.push(control);
    } else {
      seen.set(candidate, [control]);
    }
  }

  for (const [nameValue, list] of seen.entries()) {
    if (list.length < 2) {
      continue;
    }

    for (const control of list) {
      errorsByControlId[control.id] = `${control.category} Name must be unique. "${nameValue}" is already used.`;
    }
  }

  return errorsByControlId;
}

export function isNameField(control: DynamicInputControl): boolean {
  return isNameControl(control);
}
