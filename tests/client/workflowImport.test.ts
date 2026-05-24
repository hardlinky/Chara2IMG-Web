import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { importWorkflowFromText } from "../../src/shared/workflow/importWorkflow";

function readFixture(fileName: string): string {
  const fixturePath = path.resolve(__dirname, "fixtures", "workflows", fileName);

  return readFileSync(fixturePath, "utf8");
}

describe("workflow import pipeline", () => {
  it("imports a valid comfyui workflow with passing shape and template checks", () => {
    const fixture = readFixture("comfyui-valid-template.json");
    const result = importWorkflowFromText(fixture, "comfyui-valid-template.json");

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.template.validation.shapeValid).toBe(true);
    expect(result.template.validation.templateValid).toBe(true);
    expect(result.template.rawJson).toEqual(JSON.parse(fixture));
  });

  it("keeps parseable templates importable even when template rules fail", () => {
    const fixture = readFixture("comfyui-invalid-template-missing-input-node.json");
    const result = importWorkflowFromText(fixture, "comfyui-invalid-template-missing-input-node.json");

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.template.validation.shapeValid).toBe(true);
    expect(result.template.validation.templateValid).toBe(false);
    expect(result.template.validation.issues.some((issue) => issue.code === "missing-input-node")).toBe(true);
  });

  it("returns a hard failure only for malformed json", () => {
    const result = importWorkflowFromText("{ bad json", "broken.json");

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("invalid-json");
  });

  it("imports legacy parseable exports with non-blocking findings", () => {
    const fixture = readFixture("wpf-legacy-template.json");
    const result = importWorkflowFromText(fixture, "wpf-legacy-template.json");

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.template.validation.shapeValid).toBe(false);
    expect(result.template.validation.issues.length).toBeGreaterThan(0);
  });
});
