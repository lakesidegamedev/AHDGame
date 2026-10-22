"use client";

import { Fragment, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Tooltip } from "@/components/Tooltip";

/**
 * Shared two-level tab navigation (super-tabs + sub-tabs).
 *
 * Extracted from the state/region page rework so other dense hub pages (the
 * corporation page) can reuse the exact same grouping pattern instead of a
 * long horizontally-scrolling single tab row.
 *
 * Conventions kept from the region rework:
 *  - state lives in the URL (`?tab=<super>&sub=<sub>`), never in useState, so
 *    back/forward and deep links stay correct;
 *  - both bars use flex-wrap (design system: no horizontal scroll);
 *  - a super-tab with 0 or 1 visible sub-tabs renders no sub-tab bar.
 *
 * Visibility gating is the caller's job: pass an already-filtered `tabs` list.
 */

export type TabAccent = "primary" | "warning" | "error";

export interface NavSubTabDef {
  id: string;
  label: string;
  tooltip?: string;
  /** Optional trailing element (e.g. a "New" badge). */
  badge?: React.ReactNode;
  accent?: TabAccent;
}

export interface NavSuperTabDef {
  id: string;
  label: string;
  icon?: React.ReactNode;
  tooltip?: string;
  accent?: TabAccent;
  /** Sub-tabs; omit for a single-panel super-tab (e.g. Overview). */
  subTabs?: NavSubTabDef[];
}

export interface ResolvedTabs {
  superTab: string;
  subTab: string;
}

/** Legacy `?tab=<id>` values mapped onto their current (super, sub) home. */
export type LegacyTabMap = Record<string, ResolvedTabs>;

const ACCENT_ACTIVE: Record<TabAccent, string> = {
  primary: "border-primary text-primary",
  warning: "border-warning text-warning",
  error: "border-error text-error",
};

const ACCENT_IDLE: Record<TabAccent, string> = {
  primary: "border-transparent text-muted hover:border-muted hover:text-foreground",
  warning: "border-transparent text-warning/70 hover:border-warning/50 hover:text-warning",
  error: "border-transparent text-error/70 hover:border-error/50 hover:text-error",
};

// Sub-tabs are a second, quieter level: smaller text and a filled active state
// instead of a second underline, so the two bars never read as equals.
const SUB_ACTIVE: Record<TabAccent, string> = {
  primary: "bg-card-elevated font-medium text-foreground",
  warning: "bg-warning/10 font-medium text-warning",
  error: "bg-error/10 font-medium text-error",
};

const SUB_IDLE: Record<TabAccent, string> = {
  primary: "text-muted hover:bg-card-elevated/60 hover:text-foreground",
  warning: "text-warning/70 hover:text-warning",
  error: "text-error/70 hover:text-error",
};

function findTab(tabs: NavSuperTabDef[], id: string): NavSuperTabDef | undefined {
  return tabs.find((t) => t.id === id);
}

function subTabsOf(tab: NavSuperTabDef | undefined): NavSubTabDef[] {
  return tab?.subTabs ?? [];
}

/**
 * Resolve URL search-param state into a (superTab, subTab) pair.
 *
 * The new format (`?tab=<super>&sub=<sub>`) is checked BEFORE the legacy map,
 * because some legacy single-param ids are also current super-tab ids — running
 * the legacy check first would pin those groups to one sub-tab forever.
 */
export function resolveSuperTabs(
  tabs: NavSuperTabDef[],
  tabParam: string | null,
  subParam: string | null,
  legacyMap: LegacyTabMap = {},
  defaultSuperId?: string
): ResolvedTabs {
  const fallbackSuper = defaultSuperId ?? tabs[0]?.id ?? "";
  const fallbackTab = findTab(tabs, fallbackSuper);
  const fallbackSubs = subTabsOf(fallbackTab);
  const DEFAULT: ResolvedTabs = {
    superTab: fallbackSuper,
    subTab: fallbackSubs.length > 0 ? fallbackSubs[0].id : "",
  };

  if (!tabParam) return DEFAULT;

  const direct = findTab(tabs, tabParam);
  if (direct) {
    const subs = subTabsOf(direct);
    if (subParam && subs.some((s) => s.id === subParam)) {
      return { superTab: direct.id, subTab: subParam };
    }
    return { superTab: direct.id, subTab: subs.length > 0 ? subs[0].id : "" };
  }

  const legacy = legacyMap[tabParam];
  if (legacy) {
    const target = findTab(tabs, legacy.superTab);
    // The legacy destination may be hidden for this viewer (gated tab, missing
    // privileges) — fall back rather than showing an empty pane.
    if (!target) return DEFAULT;
    const subs = subTabsOf(target);
    if (legacy.subTab && !subs.some((s) => s.id === legacy.subTab)) {
      return { superTab: target.id, subTab: subs.length > 0 ? subs[0].id : "" };
    }
    return { superTab: target.id, subTab: legacy.subTab };
  }

  return DEFAULT;
}

export interface SuperTabNavProps {
  /** Already filtered for this viewer's privileges / feature gates. */
  tabs: NavSuperTabDef[];
  legacyMap?: LegacyTabMap;
  defaultSuperId?: string;
  /** For super-tabs with no sub-tabs, `subId` is "". */
  renderContent: (superId: string, subId: string) => React.ReactNode;
  /** Rendered above the super-tab bar (e.g. a campaign banner). */
  preTabContent?: React.ReactNode;
  /** Fired after a tab click, before the URL update lands. */
  onNavigate?: (superId: string, subId: string) => void;
  /**
   * Override the URL → (super, sub) resolution. Use when a page needs extra
   * rules the generic resolver has no way to know (e.g. the region page sends
   * a non-admin who deep-links `?tab=admin` back to Overview rather than to
   * Governance's first visible sub-tab).
   */
  resolve?: (tabParam: string | null, subParam: string | null) => ResolvedTabs;
  /**
   * "folder" draws the open super-tab as a folder tab joined to a panel that
   * holds the sub-tabs and content (the corporation page). Default unchanged.
   */
  variant?: "default" | "folder";
  /**
   * Below the lg breakpoint, keep the tab bar (and the folder variant's
   * sub-tab row) stuck under the site navbar, offset by `--site-navbar-h`.
   */
  sticky?: boolean;
}

const FOLDER_TOP: Record<TabAccent, string> = {
  primary: "border-t-primary",
  warning: "border-t-warning",
  error: "border-t-error",
};

const FOLDER_IDLE_TEXT: Record<TabAccent, string> = {
  primary: "text-muted hover:text-foreground",
  warning: "text-warning/80 hover:text-warning",
  error: "text-error/80 hover:text-error",
};

export function SuperTabNav({
  tabs,
  legacyMap = {},
  defaultSuperId,
  renderContent,
  preTabContent,
  onNavigate,
  resolve,
  variant = "default",
  sticky = false,
}: SuperTabNavProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Derive the active pair straight from the URL — a parallel useState can
  // desync from the URL after router.replace and swallow sub-tab clicks.
  const tabParam = searchParams.get("tab");
  const subParam = searchParams.get("sub");
  const resolved = resolve
    ? resolve(tabParam, subParam)
    : resolveSuperTabs(tabs, tabParam, subParam, legacyMap, defaultSuperId);
  const activeSuper = resolved.superTab;
  const activeSub = resolved.subTab;

  const navigate = useCallback(
    (superId: string, subId: string) => {
      onNavigate?.(superId, subId);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", superId);
      if (subId) {
        params.set("sub", subId);
      } else {
        params.delete("sub");
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname, onNavigate]
  );

  const setSuperTab = (id: string) => {
    const subs = subTabsOf(findTab(tabs, id));
    navigate(id, subs.length > 0 ? subs[0].id : "");
  };

  const currentSuperTab = findTab(tabs, activeSuper);
  const visibleSubTabs = subTabsOf(currentSuperTab);

  // The folder tabs wrap to more rows on a narrow screen, so the sticky
  // sub-tab row is offset by the bar's measured height, not a fixed guess.
  const folderRootRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = folderRootRef.current;
    const bar = tabBarRef.current;
    if (!sticky || !root || !bar || typeof ResizeObserver === "undefined") return;
    const apply = () => root.style.setProperty("--corp-tabs-h", `${bar.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [sticky]);

  if (variant === "folder") {
    return (
      <div ref={folderRootRef} className="min-w-0">
        {preTabContent}

        <div
          ref={tabBarRef}
          data-sticky-tabs={sticky ? "" : undefined}
          className={`relative z-[1] -mb-px ${
            sticky
              ? "sticky top-[var(--site-navbar-h,0px)] z-30 -mx-4 bg-background px-4 pt-1.5 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-0"
              : ""
          }`}
        >
          <nav className="flex flex-wrap items-end gap-0.5">
            {tabs.map((tab) => {
              const accent = tab.accent ?? "primary";
              const isActive = activeSuper === tab.id;
              const button = (
                <button
                  type="button"
                  onClick={() => setSuperTab(tab.id)}
                  aria-current={isActive ? "page" : undefined}
                  data-folder-tab={isActive ? "active" : "idle"}
                  className={`flex min-h-12 items-center gap-2 rounded-t-[var(--corp-rad,6px)] border border-t-[3px] px-4 text-sm font-semibold transition-colors lg:px-5 ${
                    isActive
                      ? `border-card-border border-b-card bg-card text-foreground ${FOLDER_TOP[accent]}`
                      : `border-transparent ${FOLDER_IDLE_TEXT[accent]}`
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              );
              return (
                <Fragment key={tab.id}>
                  {tab.tooltip ? <Tooltip content={tab.tooltip}>{button}</Tooltip> : button}
                </Fragment>
              );
            })}
          </nav>
        </div>

        <div
          data-folder-panel
          className="min-w-0 rounded-b-[var(--corp-rad,6px)] rounded-tr-[var(--corp-rad,6px)] border border-card-border bg-card px-3.5 pb-5 lg:px-6 lg:pb-7"
        >
          {visibleSubTabs.length > 1 && (
            <div
              className={`-mx-3.5 border-b border-card-border px-3.5 lg:-mx-6 lg:px-6 ${
                sticky
                  ? "sticky top-[calc(var(--site-navbar-h,0px)+var(--corp-tabs-h,3.25rem))] z-20 bg-card lg:static"
                  : ""
              }`}
              data-sticky-subtabs={sticky ? "" : undefined}
            >
              <nav className="flex flex-wrap items-center gap-x-6">
                {visibleSubTabs.map((sub) => {
                  const isActive = activeSub === sub.id;
                  const button = (
                    <button
                      type="button"
                      onClick={() => navigate(activeSuper, sub.id)}
                      aria-current={isActive ? "page" : undefined}
                      className={`-mb-px flex min-h-11 items-center gap-1.5 border-b-2 text-[13px] font-semibold transition-colors ${
                        isActive
                          ? "border-primary text-foreground"
                          : "border-transparent text-muted hover:text-foreground"
                      }`}
                    >
                      {sub.label}
                      {sub.badge}
                    </button>
                  );
                  return (
                    <Fragment key={sub.id}>
                      {sub.tooltip ? <Tooltip content={sub.tooltip}>{button}</Tooltip> : button}
                    </Fragment>
                  );
                })}
              </nav>
            </div>
          )}
          <div className="pt-5">{renderContent(activeSuper, activeSub)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-x-hidden">
      {preTabContent}

      {/* Super-tab bar: flex-wrap per design system (no horizontal scroll) */}
      <div className="border-b border-card-border">
        <nav className="flex flex-wrap items-center gap-x-1">
          {tabs.map((tab) => {
            const accent = tab.accent ?? "primary";
            const isActive = activeSuper === tab.id;
            const button = (
              <button
                type="button"
                onClick={() => setSuperTab(tab.id)}
                aria-current={isActive ? "page" : undefined}
                className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? accent === "primary"
                      ? "border-primary text-foreground"
                      : ACCENT_ACTIVE[accent]
                    : ACCENT_IDLE[accent]
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
            return (
              <Fragment key={tab.id}>
                {tab.tooltip ? <Tooltip content={tab.tooltip}>{button}</Tooltip> : button}
              </Fragment>
            );
          })}
        </nav>
      </div>

      {/* Sub-tab bar, only when the super-tab has more than one sub-tab */}
      {visibleSubTabs.length > 1 && (
        <div className="pt-2">
          <nav className="flex flex-wrap items-center gap-1">
            {visibleSubTabs.map((sub) => {
              const accent = sub.accent ?? "primary";
              const isActive = activeSub === sub.id;
              const button = (
                <button
                  type="button"
                  onClick={() => navigate(activeSuper, sub.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] transition-colors ${
                    isActive ? SUB_ACTIVE[accent] : SUB_IDLE[accent]
                  }`}
                >
                  {sub.label}
                  {sub.badge}
                </button>
              );
              return (
                <Fragment key={sub.id}>
                  {sub.tooltip ? <Tooltip content={sub.tooltip}>{button}</Tooltip> : button}
                </Fragment>
              );
            })}
          </nav>
        </div>
      )}

      {/* Content */}
      <div className={visibleSubTabs.length > 1 ? "mt-5" : "mt-6"}>
        {renderContent(activeSuper, activeSub)}
      </div>
    </div>
  );
}
