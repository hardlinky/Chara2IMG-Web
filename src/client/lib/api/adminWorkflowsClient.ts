export type WorkflowUploadResult =
  | { ok: true; filename: string }
  | { ok: false; error: string };

export async function uploadWorkflowTemplate(
  filename: string,
  workflow: unknown,
  overwrite: boolean
): Promise<WorkflowUploadResult> {
  const response = await fetch("/api/admin/workflows", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, workflow, overwrite })
  });
  const data = await response.json().catch(() => null) as {
    ok?: boolean;
    filename?: string;
    error?: string;
  } | null;

  if (!response.ok || !data?.ok || !data.filename) {
    return { ok: false, error: data?.error ?? "Workflow upload failed" };
  }
  return { ok: true, filename: data.filename };
}