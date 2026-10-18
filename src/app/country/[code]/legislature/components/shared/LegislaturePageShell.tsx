"use client";

import type { ReactNode } from "react";

interface ShellProps {
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  header: ReactNode;
  children: ReactNode;
}

/** Common frame; each legislature supplies its header, actions, and tab content. */
export function LegislaturePageShell({ loading, error, onRetry, header, children }: ShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {loading ? <div className="mb-5 h-[220px] rounded-2xl bg-card/60 animate-pulse" /> : header}
        {!loading && error && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            <span>Some data failed to load.</span>
            <button
              onClick={onRetry}
              className="ml-3 underline hover:text-warning/80 transition-colors"
            >
              Retry
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

export function LegislaturePageTabs<Tab extends string>({
  tabs,
  activeTab,
  onTabChange,
  children,
}: {
  tabs: { id: Tab; label: string }[];
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center gap-1 border-b border-card-border/60">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === id
              ? "border-primary text-foreground"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
      {children}
    </div>
  );
}

export function LegislatureRowsSkeleton({ kind }: { kind: "members" | "bills" }) {
  return (
    <div className="space-y-3">
      {[...Array(kind === "members" ? 5 : 4)].map((_, i) => (
        <div
          key={i}
          className={`${kind === "members" ? "h-10" : "h-16"} rounded-lg bg-card/60 animate-pulse`}
        />
      ))}
    </div>
  );
}
