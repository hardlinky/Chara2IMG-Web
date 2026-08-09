import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CreditLedgerTable } from "../../src/client/features/access/CreditAdminPanel";
import type { CreditLedgerEntryDto } from "../../src/client/lib/api/creditsClient";

function entry(index: number): CreditLedgerEntryDto {
  return {
    jobId: `job-${String(index).padStart(4, "0")}`,
    username: `user-${index}`,
    walletGroupId: "default",
    credits: index,
    settledAt: new Date(Date.UTC(2026, 7, 8, 0, 0, index)).toISOString()
  };
}

describe("credit ledger pagination", () => {
  afterEach(cleanup);

  it("shows 12 newest entries per page and navigates to older entries", () => {
    render(<CreditLedgerTable ledger={Array.from({ length: 13 }, (_, index) => entry(index + 1))} />);

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(13);
    expect(screen.getByText("user-13")).toBeTruthy();
    expect(screen.queryByText("user-1")).toBeNull();
    expect(screen.getByText("Page 1 / 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("user-1")).toBeTruthy();
    expect(screen.queryByText("user-13")).toBeNull();
    expect(screen.getByText("Page 2 / 2")).toBeTruthy();
  });
});