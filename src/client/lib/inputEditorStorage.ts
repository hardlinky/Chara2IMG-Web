import Dexie, { type Table } from "dexie";
import type { DynamicInputDraftValues, DynamicInputOrderingOverlay } from "../../shared/contracts/inputs";

type StoredInputDraft = {
  templateFingerprint: string;
  values: DynamicInputDraftValues;
  updatedAt: string;
};

type StoredOrderingOverlay = {
  id: "global";
  orderByControlId: Record<string, number>;
  sectionColumnByCategory?: Record<string, "left" | "right">;
  columnsSplitRatio?: number;
  updatedAt: string;
};

class InputEditorDatabase extends Dexie {
  drafts!: Table<StoredInputDraft, string>;
  ordering!: Table<StoredOrderingOverlay, "global">;

  constructor() {
    super("chara2imgInputEditor");
    this.version(1).stores({
      drafts: "templateFingerprint, updatedAt",
      ordering: "id, updatedAt"
    });
  }
}

const db = new InputEditorDatabase();

export async function saveInputDraftValues(
  templateFingerprint: string,
  values: DynamicInputDraftValues
): Promise<void> {
  await db.table<StoredInputDraft, string>("drafts").put({
    templateFingerprint,
    values,
    updatedAt: new Date().toISOString()
  });
}

export async function getInputDraftValues(templateFingerprint: string): Promise<DynamicInputDraftValues | null> {
  const stored = await db.table<StoredInputDraft, string>("drafts").get(templateFingerprint);
  return stored?.values ?? null;
}

export async function clearInputDraftValues(templateFingerprint: string): Promise<void> {
  await db.table<StoredInputDraft, string>("drafts").delete(templateFingerprint);
}

export async function saveInputOrderingOverlay(overlay: DynamicInputOrderingOverlay): Promise<void> {
  await db.table<StoredOrderingOverlay, "global">("ordering").put({
    id: "global",
    orderByControlId: overlay.orderByControlId,
    sectionColumnByCategory: overlay.sectionColumnByCategory,
    columnsSplitRatio: overlay.columnsSplitRatio,
    updatedAt: new Date().toISOString()
  });
}

export async function getInputOrderingOverlay(): Promise<DynamicInputOrderingOverlay> {
  const stored = await db.table<StoredOrderingOverlay, "global">("ordering").get("global");
  return {
    orderByControlId: stored?.orderByControlId ?? {},
    sectionColumnByCategory: stored?.sectionColumnByCategory ?? {},
    columnsSplitRatio: stored?.columnsSplitRatio ?? 0.5
  };
}
