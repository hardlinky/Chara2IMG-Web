import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminTab } from "../../src/client/features/access/AdminTab";

describe("AdminTab privacy", () => {
  it("does not disclose impersonation tools to non-admin users", () => {
    const html = renderToStaticMarkup(<AdminTab enabled={false} onImpersonated={vi.fn()} />);

    expect(html).not.toMatch(/impersonat/i);
  });

  it("keeps job completion notifications off by default", async () => {
    render(<AdminTab enabled={true} onImpersonated={vi.fn()} />);

    const notificationsToggle = screen.getByRole("button", { name: /notifications/i });
    fireEvent.click(notificationsToggle);

    await waitFor(() => {
      expect(screen.getByLabelText(/job completion notifications/i)).toBeTruthy();
    });

    const checkbox = screen.getByLabelText(/job completion notifications/i) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });
});