import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ActiveWorkflowTemplate } from "../../src/client/features/workflows/ActiveWorkflowTemplate";
import { WorkflowImport } from "../../src/client/features/workflows/WorkflowImport";
import type { WorkflowTemplateRecord } from "../../src/shared/contracts/workflow";

const template: WorkflowTemplateRecord = {
  fingerprint: "wf_compact",
  displayName: "Chara2IMG",
  schemaVersion: "comfyui-v1",
  importedAt: "2026-08-07T21:53:58.000Z",
  rawText: "{}",
  rawJson: {},
  validation: {
    shapeValid: true,
    templateValid: true,
    issues: []
  }
};

describe("workflow controls", () => {
  it("moves active workflow metadata into an info tooltip", () => {
    const html = renderToStaticMarkup(
      <ActiveWorkflowTemplate
        activeTemplate={template}
        recentTemplates={[template]}
        isLoading={false}
        error={null}
        onClear={vi.fn()}
        onSwitchTemplate={vi.fn()}
        onRemoveRecentTemplate={vi.fn()}
        onImported={vi.fn()}
      />
    );

    expect(html).toContain("Active Workflow: Chara2IMG");
    expect(html).toContain("Clear active workflow");
    expect(html).toContain('aria-label="Active workflow details"');
    expect(html).toContain("Fingerprint: wf_compact");
    expect(html).not.toContain("<p>Fingerprint:");
    expect(html).not.toContain("<p>Shape valid:");
  });

  it("keeps import guidance in tooltips and hides idle status copy", () => {
    const html = renderToStaticMarkup(
      <WorkflowImport
        currentTemplate={template}
        onImported={vi.fn()}
        onImportInputs={vi.fn()}
      />
    );

    expect(html).toContain('aria-label="About workflow import"');
    expect(html).toContain('aria-label="About input import"');
    expect(html).not.toContain("<p>Upload a ComfyUI workflow");
    expect(html).not.toContain("Active template loaded:");
    expect(html).not.toContain("<p>Fingerprint:");
  });
});