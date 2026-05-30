import { useCallback, useEffect, useState } from "react";
import type { WorkflowTemplateRecord } from "../../../shared/contracts/workflow";
import {
  clearActiveWorkflowTemplate,
  getActiveWorkflowTemplate,
  getRecentWorkflowTemplates,
  removeRecentWorkflowTemplate,
  saveActiveWorkflowTemplate
} from "../../lib/workflowStorage";

export function useActiveWorkflowTemplate() {
  const [activeTemplate, setActiveTemplate] = useState<WorkflowTemplateRecord | null>(null);
  const [recentTemplates, setRecentTemplates] = useState<WorkflowTemplateRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadActiveTemplate() {
      try {
        const [storedTemplate, storedRecents] = await Promise.all([
          getActiveWorkflowTemplate(),
          getRecentWorkflowTemplates()
        ]);

        if (mounted) {
          setActiveTemplate(storedTemplate);
          setRecentTemplates(storedRecents);
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
    const recents = await getRecentWorkflowTemplates();
    setActiveTemplate(template);
    setRecentTemplates(recents);
    setError(null);
  }, []);

  const clearTemplate = useCallback(async () => {
    await clearActiveWorkflowTemplate();
    setActiveTemplate(null);
    setError(null);
  }, []);

  const removeRecentTemplate = useCallback(async (fingerprint: string) => {
    await removeRecentWorkflowTemplate(fingerprint);
    setRecentTemplates((current) => current.filter((template) => template.fingerprint !== fingerprint));
  }, []);

  return {
    activeTemplate,
    recentTemplates,
    isLoading,
    error,
    persistTemplate,
    clearTemplate,
    removeRecentTemplate
  };
}
