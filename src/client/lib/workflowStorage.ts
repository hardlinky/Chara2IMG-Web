import Dexie, { type Table } from "dexie";
import type { WorkflowTemplateRecord } from "../../shared/contracts/workflow";

type StoredWorkflowTemplate = WorkflowTemplateRecord & {
  id: "active";
};

class WorkflowTemplateDatabase extends Dexie {
  templates!: Table<StoredWorkflowTemplate, "active">;

  constructor() {
    super("chara2imgWorkflowTemplates");
    this.version(1).stores({
      templates: "id, fingerprint, importedAt"
    });
  }
}

const db = new WorkflowTemplateDatabase();

export async function saveActiveWorkflowTemplate(template: WorkflowTemplateRecord): Promise<void> {
  await db.table<StoredWorkflowTemplate, "active">("templates").put({
    id: "active",
    ...template
  });
}

export async function getActiveWorkflowTemplate(): Promise<WorkflowTemplateRecord | null> {
  const template = await db.table<StoredWorkflowTemplate, "active">("templates").get("active");

  if (!template) {
    return null;
  }

  const { id: _, ...record } = template;
  return record;
}

export async function clearActiveWorkflowTemplate(): Promise<void> {
  await db.table<StoredWorkflowTemplate, "active">("templates").delete("active");
}
