import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "../../src/client/components/app-shell/AppShell";
import type { AppTabDefinition } from "../../src/client/components/app-shell/TopTabRail";

const tabs: AppTabDefinition[] = [
  { id: "setup", label: "Setup" },
  { id: "input", label: "Input" },
  { id: "jobs", label: "Jobs" },
  { id: "output", label: "Output" }
];

describe("app shell navigation", () => {
  it("renders four tab destinations with aria tab wiring", () => {
    const html = renderToStaticMarkup(
      <AppShell
        tabs={tabs}
        activeTab="setup"
        onTabChange={() => undefined}
        headerRowOne={<h1>Header</h1>}
        panels={{
          setup: <p>Setup panel</p>,
          input: <p>Input panel</p>,
          jobs: <p>Jobs panel</p>,
          output: <p>Output panel</p>
        }}
      />
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('id="tab-setup"');
    expect(html).toContain('id="tab-input"');
    expect(html).toContain('id="tab-jobs"');
    expect(html).toContain('id="tab-output"');
    expect(html).toContain('aria-controls="panel-setup"');
    expect(html).toContain('aria-labelledby="tab-setup"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('tabindex="-1"');
  });

  it("renders mirrored mobile nav destinations", () => {
    const html = renderToStaticMarkup(
      <AppShell
        tabs={tabs}
        activeTab="jobs"
        onTabChange={() => undefined}
        headerRowOne={<h1>Header</h1>}
        panels={{
          setup: <p>Setup panel</p>,
          input: <p>Input panel</p>,
          jobs: <p>Jobs panel</p>,
          output: <p>Output panel</p>
        }}
      />
    );

    expect(html).toContain('id="mobile-tab-setup"');
    expect(html).toContain('id="mobile-tab-input"');
    expect(html).toContain('id="mobile-tab-jobs"');
    expect(html).toContain('id="mobile-tab-output"');
    expect(html).toContain('data-tab-id="setup"');
    expect(html).toContain('data-tab-id="input"');
    expect(html).toContain('data-tab-id="jobs"');
    expect(html).toContain('data-tab-id="output"');
  });

  it("renders the jobs tab badge when a badge count is set", () => {
    const tabsWithBadge: AppTabDefinition[] = tabs.map((tab) => (tab.id === "jobs" ? { ...tab, badge: 3 } : tab));

    const html = renderToStaticMarkup(
      <AppShell
        tabs={tabsWithBadge}
        activeTab="jobs"
        onTabChange={() => undefined}
        headerRowOne={<h1>Header</h1>}
        panels={{
          setup: <p>Setup panel</p>,
          input: <p>Input panel</p>,
          jobs: <p>Jobs panel</p>,
          output: <p>Output panel</p>
        }}
      />
    );

    expect(html).toContain("tab-badge");
    expect(html).toContain(">3<");
  });
});
