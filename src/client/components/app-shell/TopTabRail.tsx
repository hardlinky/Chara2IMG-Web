export type AppTabId = "setup" | "input" | "jobs" | "output" | "albums" | "admin";

export type AppTabDefinition = {
  id: AppTabId;
  label: string;
  badge?: number;
};

type TopTabRailProps = {
  tabs: AppTabDefinition[];
  activeTab: AppTabId;
  onTabChange: (tabId: AppTabId) => void;
};

export function TopTabRail({ tabs, activeTab, onTabChange }: TopTabRailProps) {
  return (
    <div className="tab-rail" role="tablist" aria-label="Primary navigation">
      {tabs.map((tab) => {
        const selected = tab.id === activeTab;

        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            className={`tab-pill interactive ${selected ? "tab-pill-active" : "tab-pill-inactive"}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.badge != null && tab.badge > 0 ? <span className="tab-badge">{tab.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
