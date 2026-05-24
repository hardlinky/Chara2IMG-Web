import type { ReactNode } from "react";
import { BottomTabNav } from "./BottomTabNav";
import { TopTabRail, type AppTabDefinition, type AppTabId } from "./TopTabRail";

type AppShellProps = {
  tabs: AppTabDefinition[];
  activeTab: AppTabId;
  onTabChange: (tabId: AppTabId) => void;
  headerRowOne: ReactNode;
  headerRowTwo?: ReactNode;
  panels: Record<AppTabId, ReactNode>;
};

export function AppShell({ tabs, activeTab, onTabChange, headerRowOne, headerRowTwo, panels }: AppShellProps) {
  return (
    <main className="app-shell" data-theme="theme-01">
      <div className="app-shell-main section-stack">
        <header className="panel-surface app-header">
          <div className="app-header-row app-header-row-one">{headerRowOne}</div>
          {headerRowTwo ? <div className="app-header-row app-header-row-two">{headerRowTwo}</div> : null}
          <TopTabRail tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
        </header>

        {tabs.map((tab) => {
          const selected = tab.id === activeTab;

          return (
            <section
              key={tab.id}
              id={`panel-${tab.id}`}
              role="tabpanel"
              aria-labelledby={`tab-${tab.id}`}
              hidden={!selected}
              className="panel-surface tab-panel"
            >
              {panels[tab.id]}
            </section>
          );
        })}
      </div>

      <BottomTabNav tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
    </main>
  );
}
