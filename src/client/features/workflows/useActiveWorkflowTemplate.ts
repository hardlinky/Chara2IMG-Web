import { useCallback, useEffect, useState } from "react";
import type { WorkflowTemplateRecord } from "../../../shared/contracts/workflow";
import {
  clearActiveWorkflowTemplate,
  getActiveWorkflowTemplate,
  saveActiveWorkflowTemplate
} from "../../lib/workflowStorage";

export function useActiveWorkflowTemplate() {
  const [activeTemplate, setActiveTemplate] = useState<WorkflowTemplateRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadActiveTemplate() {
      try {
        const storedTemplate = await getActiveWorkflowTemplate();

        if (mounted) {
          setActiveTemplate(storedTemplate);
        }
      } catch (loadError) {
        if (mounted) {
          const message = loadError instanceof Error ? loadError.message : "Failed to load active workflow template.";
          setError(message);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void loadActiveTemplate();

    return () => {
      mounted = false;
    };
  }, []);

  const persistTemplate = useCallback(async (template: WorkflowTemplateRecord) => {
    await saveActiveWorkflowTemplate(template);
    setActiveTemplate(template);
    setError(null);
  }, []);

  const clearTemplate = useCallback(async () => {
    await clearActiveWorkflowTemplate();
    setActiveTemplate(null);
    setError(null);
  }, []);

  return {
    activeTemplate,
    isLoading,
    error,
    persistTemplate,
    clearTemplate
  };
}
