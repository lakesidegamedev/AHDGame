"use client";

import { PILL_SHAPE, pillClass } from "@/components/ui/selectedState";

export type PoliticalOperationsTab = "overview" | "stateElection" | "presidentialElection";

interface Props {
  activeTab: PoliticalOperationsTab;
  onChange: (tab: PoliticalOperationsTab) => void;
}

export function PoliticalOperationsTabs({ activeTab, onChange }: Props) {
  const tabs: Array<{ id: PoliticalOperationsTab; label: string; disabled: boolean }> = [
    { id: "overview", label: "Overview", disabled: false },
    { id: "stateElection", label: "State election", disabled: true },
    { id: "presidentialElection", label: "Presidential election", disabled: false },
  ];

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-card-border pb-2" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={activeTab === t.id}
          disabled={t.disabled}
          onClick={() => !t.disabled && onChange(t.id)}
          className={`shrink-0 whitespace-nowrap px-4 py-1.5 text-body ${
            t.disabled
              ? `${PILL_SHAPE} cursor-not-allowed text-muted/50`
              : pillClass(activeTab === t.id)
          }`}
          title={t.disabled ? "Available in a future update" : undefined}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
