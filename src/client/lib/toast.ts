export type ToastTone = "success" | "error" | "info";

export type ToastOptions = {
  tone?: ToastTone;
  durationMs?: number;
};

function getContainer(): HTMLElement {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    document.body.append(container);
  }
  return container;
}

export function showToast(message: string, options: ToastOptions = {}): void {
  if (typeof document === "undefined") return;

  const tone = options.tone ?? "info";
  const durationMs = options.durationMs ?? 4000;

  const container = getContainer();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.tone = tone;
  toast.textContent = message;
  container.append(toast);

  // Trigger enter transition on next frame.
  requestAnimationFrame(() => toast.classList.add("toast--visible"));

  let removed = false;
  function dismiss(): void {
    if (removed) return;
    removed = true;
    toast.classList.remove("toast--visible");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    window.setTimeout(() => toast.remove(), 300);
  }

  toast.addEventListener("click", dismiss);
  window.setTimeout(dismiss, durationMs);
}
