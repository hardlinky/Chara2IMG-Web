import type { DynamicInputControl, DynamicInputDraftValues } from "../../../shared/contracts/inputs";

function toVariableSegment(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return cleaned || "Unnamed";
}

function isNameControl(control: DynamicInputControl): boolean {
  return control.name.trim().toLowerCase() === "name";
}

function toDraftText(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

export function buildVariableTokenParts(control: DynamicInputControl, sectionName?: string): {
  generic: string;
  named: string | null;
} {
  const fieldSegment = toVariableSegment(control.name);
  const generic = `{${toVariableSegment(control.category)}_${fieldSegment}}`;
  const named = sectionName ? `{${toVariableSegment(sectionName)}_${fieldSegment}}` : null;

  return {
    generic,
    named
  };
}

export function deriveSectionNamesByCategory(controls: DynamicInputControl[], draftValues: DynamicInputDraftValues): Record<string, string> {
  const next: Record<string, string> = {};

  for (const control of controls) {
    if (!isNameControl(control)) {
      continue;
    }

    const candidate = toDraftText(draftValues[control.id] ?? control.defaultValue);
    if (candidate) {
      next[control.category] = candidate;
    }
  }

  return next;
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
