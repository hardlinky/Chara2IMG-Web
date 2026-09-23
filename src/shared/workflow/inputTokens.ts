import type { DynamicInputControl, DynamicInputDraftValues } from "../contracts/inputs";

// Legacy spellings kept resolvable for templates authored before the {Category.Field} convention.
export const CATEGORY_ALIASES: Record<string, string> = {
  Character: "Character",
  Costume: "Costume",
  "Character Pose": "CharaPose"
};

// Braces containing "|" are left alone so ComfyUI {a|b|c} wildcards survive resolution.
const TOKEN_PATTERN = /\{([^{}|\r\n]{1,120})\}/g;

export function toVariableSegment(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return cleaned || "Unnamed";
}

export function getCategoryAlias(category: string): string {
  return CATEGORY_ALIASES[category] || toVariableSegment(category);
}

/**
 * Collapses case and every separator so `{Character_BodyDetails}`,
 * `{Character_Body_Details}` and `{character bodydetails}` share one key.
 */
function toMatchKey(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function isNameControl(control: DynamicInputControl): boolean {
  return control.name.trim().toLowerCase() === "name";
}

function toDraftText(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

export function deriveSectionNamesByCategory(
  controls: DynamicInputControl[],
  draftValues: DynamicInputDraftValues
): Record<string, string> {
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

/**
 * Maps every accepted spelling of a variable to its current raw value. Each control is
 * reachable through its category alias, its literal category, and its section Name value.
 */
export function buildTokenIndex(
  controls: DynamicInputControl[],
  draftValues: DynamicInputDraftValues
): Map<string, string> {
  const namesByCategory = deriveSectionNamesByCategory(controls, draftValues);
  const index = new Map<string, string>();

  for (const control of controls) {
    const value = draftValues[control.id] ?? control.defaultValue;
    if (typeof value !== "string") {
      continue;
    }

    const prefixes = [getCategoryAlias(control.category), control.category];
    const sectionName = namesByCategory[control.category];
    if (sectionName) {
      prefixes.push(sectionName);
    }

    for (const prefix of prefixes) {
      const key = toMatchKey(`${prefix}${control.name}`);
      if (!key || index.has(key)) {
        continue;
      }

      index.set(key, value);
    }
  }

  return index;
}

/** Single pass by design: a token inside a resolved value stays literal, matching the old graph. */
export function resolveTokensInText(text: string, index: Map<string, string>): string {
  if (!text.includes("{")) {
    return text;
  }

  return text.replace(TOKEN_PATTERN, (match, inner: string) => {
    const replacement = index.get(toMatchKey(inner));
    return replacement === undefined ? match : replacement;
  });
}
