import { KeyboardEvent } from "react";

export type AppTabId = "setup" | "input" | "jobs" | "output";

export type AppTabDefinition = {
  id: AppTabId;
  label: string;
  iconInactive: string;
  iconActive: string;
};

type TopTabRailProps = {
  tabs: AppTabDefinition[];
  activeTab: AppTabId;
  onTabChange: (tabId: AppTabId) => void;
};

export function TopTabRail({ tabs, activeTab, onTabChange }: TopTabRailProps) {
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number): void {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") {
      return;
    }

    event.preventDefault();

    if (event.key === "Home") {
      onTabChange(tabs[0].id);
      return;
    }

    if (event.key === "End") {
      onTabChange(tabs[tabs.length - 1].id);
      return;
    }

    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    onTabChange(tabs[nextIndex].id);
  }

  return (
    <div className="tab-rail" role="tablist" aria-label="Primary navigation">
      {tabs.map((tab, index) => {
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
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            <span aria-hidden>{selected ? tab.iconActive : tab.iconInactive}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
