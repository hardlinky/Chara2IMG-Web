import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { importWorkflowFromText } from "../../src/shared/workflow/importWorkflow";
import {
  clearActiveWorkflowTemplate,
  getActiveWorkflowTemplate,
  saveActiveWorkflowTemplate
} from "../../src/client/lib/workflowStorage";

function readFixture(fileName: string): string {
  const fixturePath = path.resolve(__dirname, "fixtures", "workflows", fileName);

  return readFileSync(fixturePath, "utf8");
}

describe("workflow template reuse", () => {
  beforeEach(async () => {
    await clearActiveWorkflowTemplate();
  });

  it("reuses the same active template across multiple read cycles", async () => {
    const fixture = readFixture("comfyui-valid-template.json");
    const imported = importWorkflowFromText(fixture, "comfyui-valid-template.json");

    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    await saveActiveWorkflowTemplate(imported.template);

    const firstUse = await getActiveWorkflowTemplate();
    const secondUse = await getActiveWorkflowTemplate();

    expect(firstUse?.fingerprint).toBe(imported.template.fingerprint);
    expect(secondUse?.fingerprint).toBe(imported.template.fingerprint);
    expect(secondUse?.rawJson).toEqual(imported.template.rawJson);
  });

  it("replaces the active template when a new parseable workflow is imported", async () => {
    const first = importWorkflowFromText(
      readFixture("comfyui-valid-template.json"),
      "comfyui-valid-template.json"
    );
    const second = importWorkflowFromText(
      readFixture("comfyui-invalid-template-missing-input-node.json"),
      "comfyui-invalid-template-missing-input-node.json"
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    if (!first.ok || !second.ok) {
      return;
    }

    await saveActiveWorkflowTemplate(first.template);
    await saveActiveWorkflowTemplate(second.template);

    const active = await getActiveWorkflowTemplate();

    expect(active?.fingerprint).toBe(second.template.fingerprint);
    expect(active?.displayName).toBe(second.template.displayName);
    expect(active?.rawJson).toEqual(second.template.rawJson);
  });
});
