type WorkflowInfoButtonProps = {
  label: string;
  tooltip: string;
};

export function WorkflowInfoButton({ label, tooltip }: WorkflowInfoButtonProps) {
  return (
    <button
      className="workflow-info-button"
      type="button"
      aria-label={label}
      data-tooltip={tooltip}
      title={tooltip}
    >
      i
    </button>
  );
}