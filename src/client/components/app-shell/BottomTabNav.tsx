import type { AppTabDefinition, AppTabId } from "./TopTabRail";

type BottomTabNavProps = {
  tabs: AppTabDefinition[];
  activeTab: AppTabId;
  onTabChange: (tabId: AppTabId) => void;
};

export function BottomTabNav({ tabs, activeTab, onTabChange }: BottomTabNavProps) {
  return (
    <nav className="bottom-tab-nav" aria-label="Primary mobile navigation">
      {tabs.map((tab) => {
        const selected = tab.id === activeTab;

        return (
          <button
            key={tab.id}
            id={`mobile-tab-${tab.id}`}
            type="button"
            data-tab-id={tab.id}
            aria-current={selected ? "page" : undefined}
            className={`bottom-tab-item interactive ${selected ? "bottom-tab-item-active" : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
