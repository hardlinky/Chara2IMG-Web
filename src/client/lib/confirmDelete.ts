export type ConfirmDeleteOptions = {
  message?: string;
  confirmLabel?: string;
};

// In-memory only: resets on page reload (never persisted).
let skipForSession = false;

export function confirmDeletion(options: ConfirmDeleteOptions = {}): Promise<boolean> {
  if (skipForSession) return Promise.resolve(true);
  if (typeof document === "undefined") return Promise.resolve(true);

  const message = options.message ?? "Are you sure? This can't be undone.";
  const confirmLabel = options.confirmLabel ?? "Delete";

  return new Promise<boolean>((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "workflow-import-dialog confirm-dialog";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Confirm deletion");

    const card = document.createElement("div");
    card.className = "card workflow-import-dialog-card confirm-dialog-card";

    const text = document.createElement("p");
    text.className = "confirm-dialog-message";
    text.textContent = message;

    const skipLabel = document.createElement("label");
    skipLabel.className = "confirm-dialog-skip";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const skipText = document.createElement("span");
    skipText.textContent = "Don't ask again";
    skipLabel.append(checkbox, skipText);

    const actions = document.createElement("div");
    actions.className = "workflow-import-dialog-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn-secondary";
    cancelBtn.textContent = "Cancel";
    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "btn btn-destructive";
    confirmBtn.textContent = confirmLabel;
    actions.append(cancelBtn, confirmBtn);

    card.append(text, skipLabel, actions);
    overlay.append(card);

    function cleanup(result: boolean): void {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(result);
    }
    function onConfirm(): void {
      if (checkbox.checked) skipForSession = true;
      cleanup(true);
    }
    function onCancel(): void {
      cleanup(false);
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") onCancel();
    }

    cancelBtn.addEventListener("click", onCancel);
    confirmBtn.addEventListener("click", onConfirm);
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay) onCancel();
    });
    document.addEventListener("keydown", onKey);

    document.body.append(overlay);
    confirmBtn.focus();
  });
}
