import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { WorkflowTemplateRecord } from "../../src/shared/contracts/workflow";
import {
  clearActiveWorkflowTemplate,
  clearRecentWorkflowTemplates,
  getActiveWorkflowTemplate,
  getRecentWorkflowTemplates,
  removeRecentWorkflowTemplate,
  saveActiveWorkflowTemplate
} from "../../src/client/lib/workflowStorage";

function createTemplate(seed: string): WorkflowTemplateRecord {
  return {
    fingerprint: `wf_${seed}`,
    displayName: `template-${seed}`,
    schemaVersion: "comfyui-v1",
    importedAt: new Date("2026-05-23T00:00:00.000Z").toISOString(),
    rawText: `{"seed":"${seed}"}`,
    rawJson: {
      1: {
        class_type: "KSampler",
        inputs: {
          seed
        }
      }
    },
    validation: {
      shapeValid: true,
      templateValid: true,
      issues: []
    }
  };
}

describe("workflowStorage", () => {
  beforeEach(async () => {
    await clearActiveWorkflowTemplate();
    await clearRecentWorkflowTemplates();
  });

  it("stores and restores the active workflow template with full fidelity", async () => {
    const template = createTemplate("1234");

    await saveActiveWorkflowTemplate(template);

    const restoredTemplate = await getActiveWorkflowTemplate();

    expect(restoredTemplate).toEqual(template);
  });

  it("returns null when no active template exists", async () => {
    const restoredTemplate = await getActiveWorkflowTemplate();

    expect(restoredTemplate).toBeNull();
  });

  it("keeps recent workflow templates in newest-first order", async () => {
    const first = createTemplate("first");
    const second = createTemplate("second");

    await saveActiveWorkflowTemplate(first);
    await saveActiveWorkflowTemplate(second);

    const recentTemplates = await getRecentWorkflowTemplates();

    expect(recentTemplates.map((template) => template.fingerprint)).toEqual([
      second.fingerprint,
      first.fingerprint
    ]);
  });

  it("moves an existing workflow to the top instead of duplicating it", async () => {
    const first = createTemplate("first");
    const second = createTemplate("second");

    await saveActiveWorkflowTemplate(first);
    await saveActiveWorkflowTemplate(second);
    await saveActiveWorkflowTemplate(first);

    const recentTemplates = await getRecentWorkflowTemplates();

    expect(recentTemplates.map((template) => template.fingerprint)).toEqual([
      first.fingerprint,
      second.fingerprint
    ]);
  });

  it("removes a workflow from recents and keeps it removed", async () => {
    const first = createTemplate("first");
    const second = createTemplate("second");

    await saveActiveWorkflowTemplate(first);
    await saveActiveWorkflowTemplate(second);
    await removeRecentWorkflowTemplate(first.fingerprint);

    const recentTemplates = await getRecentWorkflowTemplates();

    expect(recentTemplates.map((template) => template.fingerprint)).toEqual([
      second.fingerprint
    ]);
  });
});
