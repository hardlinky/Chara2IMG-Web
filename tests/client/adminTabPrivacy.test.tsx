import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminTab } from "../../src/client/features/access/AdminTab";

describe("AdminTab privacy", () => {
  it("does not disclose impersonation tools to non-admin users", () => {
    const html = renderToStaticMarkup(<AdminTab enabled={false} onImpersonated={vi.fn()} />);

    expect(html).not.toMatch(/impersonat/i);
  });
});