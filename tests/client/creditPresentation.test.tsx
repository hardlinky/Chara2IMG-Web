import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RecentJobRecord } from "../../src/shared/contracts/jobs";
import { CreditBalanceDisplay } from "../../src/client/features/access/CreditBalanceDisplay";
import { formatJobPrice } from "../../src/client/features/jobs/jobPrice";
import { CreditAccountEditor, CreditAccountsTable } from "../../src/client/features/access/CreditAdminPanel";

function job(overrides: Partial<RecentJobRecord> = {}): RecentJobRecord {
  return {
    jobId: "job-1",
    endpointId: "managed",
    submittedAt: "2026-08-08T00:00:00.000Z",
    hiddenAt: null,
    lifecycle: { status: "COMPLETED", isTerminal: true, startedAt: "2026-08-08T00:00:00.000Z" },
    provenance: { templateFingerprint: "fp", draftValues: {}, submittedInput: {} },
    lastResponse: null,
    lastError: null,
    billingMode: "managed",
    creditsCharged: 2,
    ...overrides
  };
}

describe("credit presentation", () => {
  it("shows refreshing and static balances", () => {
    const html = renderToStaticMarkup(<CreditBalanceDisplay balance={{
      managed: true,
      unlimited: false,
      refreshingCredits: 7,
      staticCredits: -2
    }} />);

    expect(html).toContain("Green: 7");
    expect(html).toContain("Gold: -2");
  });

  it("shows Free for an unknown endpoint wallet", () => {
    const html = renderToStaticMarkup(<CreditBalanceDisplay balance={{ managed: false, unlimited: true }} />);
    expect(html).toContain("Credits: Free");
  });

  it("returns numeric-only finalized and live job prices", () => {
    expect(formatJobPrice(job({ billingMode: "free" }), Date.parse("2026-08-08T00:00:20.000Z"))).toBeNull();
    expect(formatJobPrice(job({ refreshingCreditsCharged: 2, staticCreditsCharged: 0 }), Date.parse("2026-08-08T00:00:20.000Z"))).toEqual({
      refreshingCredits: 2,
      staticCredits: 0,
      state: "final"
    });
    expect(formatJobPrice(job({
      creditsCharged: undefined,
      lifecycle: { status: "IN_PROGRESS", isTerminal: false, startedAt: "2026-08-08T00:00:00.000Z" }
    }), Date.parse("2026-08-08T00:00:10.001Z"))).toEqual({ estimatedCredits: 2, state: "current" });
  });

  it("renders every managed wallet control for administrators", () => {
    const html = renderToStaticMarkup(<CreditAccountEditor
      users={["artist"]}
      walletGroups={["default"]}
      onSaved={() => undefined}
    />);

    expect(html).toContain("Username");
    expect(html).toContain("Wallet group");
    expect(html).toContain("Allowance");
    expect(html).toContain("Refresh every");
    expect(html).toContain("Minutes");
    expect(html).toContain("Hours");
    expect(html).toContain("Days");
    expect(html).toContain("Green balance");
    expect(html).toContain("Gold balance");
    expect(html).toContain("Concurrent jobs");
  });

  it("labels the shared anonymous wallet identity", () => {
    const html = renderToStaticMarkup(<CreditAccountEditor
      users={["anonymous", "artist"]}
      walletGroups={["default"]}
      onSaved={() => undefined}
    />);

    expect(html).toContain("Anonymous users (shared)");
  });

  it("lists the shared anonymous wallet before it is configured", () => {
    const html = renderToStaticMarkup(<CreditAccountsTable accounts={[]} onEdit={() => undefined} />);

    expect(html).toContain("Anonymous users (shared)");
    expect(html).toContain("Not configured");
    expect(html).toContain("Edit");
  });
});