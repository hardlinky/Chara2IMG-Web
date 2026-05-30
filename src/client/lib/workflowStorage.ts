import Dexie, { type Table } from "dexie";
import type { WorkflowTemplateRecord } from "../../shared/contracts/workflow";

type StoredWorkflowTemplate = WorkflowTemplateRecord & {
  id: "active";
};

type StoredRecentWorkflowTemplate = WorkflowTemplateRecord & {
  id: string;
  lastUsedAt: string;
};

class WorkflowTemplateDatabase extends Dexie {
  templates!: Table<StoredWorkflowTemplate, "active">;
  recentTemplates!: Table<StoredRecentWorkflowTemplate, string>;

  constructor() {
    super("chara2imgWorkflowTemplates");
    this.version(1).stores({
      templates: "id, fingerprint, importedAt"
    });
    this.version(2).stores({
      templates: "id, fingerprint, importedAt",
      recentTemplates: "id, fingerprint, importedAt, lastUsedAt"
    });
  }
}

const db = new WorkflowTemplateDatabase();

const RECENT_WORKFLOW_LIMIT = 8;

export async function saveActiveWorkflowTemplate(template: WorkflowTemplateRecord): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction("rw", db.templates, db.recentTemplates, async () => {
    await db.table<StoredWorkflowTemplate, "active">("templates").put({
      id: "active",
      ...template
    });

    await db.table<StoredRecentWorkflowTemplate, string>("recentTemplates").put({
      id: template.fingerprint,
      lastUsedAt: now,
      ...template
    });

    const staleEntries = await db
      .table<StoredRecentWorkflowTemplate, string>("recentTemplates")
      .orderBy("lastUsedAt")
      .reverse()
      .offset(RECENT_WORKFLOW_LIMIT)
      .toArray();

    if (staleEntries.length > 0) {
      await db
        .table<StoredRecentWorkflowTemplate, string>("recentTemplates")
        .bulkDelete(staleEntries.map((entry) => entry.id));
    }
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

export async function getRecentWorkflowTemplates(limit = RECENT_WORKFLOW_LIMIT): Promise<WorkflowTemplateRecord[]> {
  const templates = await db
    .table<StoredRecentWorkflowTemplate, string>("recentTemplates")
    .orderBy("lastUsedAt")
    .reverse()
    .limit(Math.max(1, limit))
    .toArray();

  return templates.map(({ id: _id, lastUsedAt: _lastUsedAt, ...record }) => record);
}

export async function clearRecentWorkflowTemplates(): Promise<void> {
  await db.table<StoredRecentWorkflowTemplate, string>("recentTemplates").clear();
}
