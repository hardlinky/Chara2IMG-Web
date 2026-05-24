import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { WorkflowTemplateRecord } from "../../src/shared/contracts/workflow";
import {
  clearActiveWorkflowTemplate,
  getActiveWorkflowTemplate,
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
});
