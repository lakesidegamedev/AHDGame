"use client";

/**
 * Phone navigation layout A: a bottom dock of the most visited destinations
 * (company, home state, nation, Actions) plus More, with section tabs opening a
 * grouped card sheet built from the same menus as the desktop grouped cards.
 *
 * The dock owns the bottom edge on phones. It publishes its height as
 * `--mobile-dock-height` and marks <html data-mobile-dock> so the StatusBar
 * rides directly above it instead of under it.
 */

import React, { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { captureProductEvent } from "@/lib/analytics/capture";
import { PixelNavIcon } from "./PixelNavIcon";
import { pixelIconForLink, type DesktopNavLink, type DesktopNavMenu } from "./desktopNavModel";

export const MOBILE_DOCK_HEIGHT_VAR = "--mobile-dock-height";
/** Fired on window when the dock's height changes, so StatusBar can re-measure.
 *  useStatusBarHeightVar keeps its own copy of this name. */
export const MOBILE_DOCK_EVENT = "ahd:mobile-dock";

export type DockSheetKey = "state" | "nation" | "more";

export interface DockTab {
  id: string;
  label: string;
  icon: ReactNode;
  href?: string;
  sheet?: DockSheetKey;
  active: boolean;
}

export interface DockSection {
  id: string;
  /** Section heading; omitted when the sheet holds one section. */
  title?: string;
  menu: DesktopNavMenu;
}

export interface DockSheet {
  title: string;
  header?: ReactNode;
  sections: DockSection[];
}

interface MobileDockProps {
  tabs: DockTab[];
  openSheet: DockSheetKey | null;
  onOpenSheet: (key: DockSheetKey | null) => void;
  sheets: Partial<Record<DockSheetKey, DockSheet>>;
}

export function MobileDockIcon({ name }: { name: Parameters<typeof PixelNavIcon>[0]["name"] }) {
  return <PixelNavIcon name={name} className="h-5 w-5" />;
}

export function MobileDockGridIcon() {
  return (
    <svg
      viewBox="0 0 11 11"
      className="h-5 w-5"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="1" width="4" height="4" />
      <rect x="6" y="1" width="4" height="4" />
      <rect x="1" y="6" width="4" height="4" />
      <rect x="6" y="6" width="4" height="4" />
    </svg>
  );
}

function usePublishDockHeight(ref: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!el) return;
    const publish = () => {
      // lg:hidden collapses the dock to zero on wide screens; nothing to clear then.
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height > 0) {
        root.style.setProperty(MOBILE_DOCK_HEIGHT_VAR, `${height}px`);
        root.dataset.mobileDock = "";
      } else {
        root.style.removeProperty(MOBILE_DOCK_HEIGHT_VAR);
        delete root.dataset.mobileDock;
      }
      window.dispatchEvent(new Event(MOBILE_DOCK_EVENT));
    };
    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(el);
    window.addEventListener("resize", publish);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", publish);
      root.style.removeProperty(MOBILE_DOCK_HEIGHT_VAR);
      delete root.dataset.mobileDock;
      window.dispatchEvent(new Event(MOBILE_DOCK_EVENT));
    };
  }, [ref]);
}

export function MobileDock({ tabs, openSheet, onOpenSheet, sheets }: MobileDockProps) {
  const t = useTranslations("nav");
  const dockRef = useRef<HTMLElement>(null);
  usePublishDockHeight(dockRef);
  const sheet = openSheet ? sheets[openSheet] : undefined;

  useEffect(() => {
    if (!sheet) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenSheet(null);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [sheet, onOpenSheet]);

  return (
    <>
      {sheet && openSheet && (
        <div className="lg:hidden" data-feedback-ignore="true">
          <button
            type="button"
            aria-label={t("dock.close")}
            className="fixed inset-0 z-[44] bg-black/60"
            onClick={() => onOpenSheet(null)}
          />
          <div
            id="mobile-dock-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={sheet.title}
            className="fixed inset-x-0 bottom-[var(--mobile-dock-height,0px)] top-[calc(env(safe-area-inset-top,0px)+3.5rem)] z-[45] flex flex-col overflow-hidden rounded-t-2xl border-t border-card-border bg-card shadow-modal"
          >
            <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-3">
              <h2 className="truncate text-[17px] font-bold text-foreground">{sheet.title}</h2>
              <button
                type="button"
                onClick={() => onOpenSheet(null)}
                className="min-h-9 rounded-lg border border-card-border px-3 text-xs font-medium text-muted hover:text-foreground"
              >
                {t("dock.close")}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
              {sheet.header}
              {sheet.sections.map((section) => (
                <DockSectionView
                  key={section.id}
                  section={section}
                  sheetId={openSheet}
                  onNavigate={() => onOpenSheet(null)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
      <nav
        ref={dockRef}
        aria-label={t("dock.label")}
        data-feedback-ignore="true"
        className="fixed inset-x-0 bottom-0 z-[46] border-t border-card-border/80 bg-card/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl lg:hidden"
      >
        <ul className="mx-auto flex h-14 max-w-xl">
          {tabs.map((tab) => {
            const lit = tab.sheet ? openSheet === tab.sheet : tab.active && !openSheet;
            const className = `relative flex h-full w-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary ${lit ? "text-foreground" : "text-muted hover:text-foreground"}`;
            const content = (
              <>
                {lit && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-[22%] top-0 h-0.5 rounded-full bg-primary"
                  />
                )}
                <span className="flex h-5 items-center">{tab.icon}</span>
                <span className="block max-w-full truncate">{tab.label}</span>
              </>
            );
            const track = () =>
              void captureProductEvent("mobile_navigation_tab_selected", { tab: tab.id });
            return (
              <li key={tab.id} className="min-w-0 flex-1">
                {tab.href ? (
                  <Link
                    href={tab.href}
                    aria-current={tab.active ? "page" : undefined}
                    className={className}
                    onClick={() => {
                      track();
                      onOpenSheet(null);
                    }}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    aria-expanded={openSheet === tab.sheet}
                    aria-controls={openSheet === tab.sheet ? "mobile-dock-sheet" : undefined}
                    className={className}
                    onClick={() => {
                      if (openSheet !== tab.sheet) track();
                      onOpenSheet(openSheet === tab.sheet ? null : (tab.sheet ?? null));
                    }}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function DockSectionView({
  section,
  sheetId,
  onNavigate,
}: {
  section: DockSection;
  sheetId: DockSheetKey;
  onNavigate: () => void;
}) {
  const t = useTranslations("nav");
  const { menu } = section;
  const select = (item: DesktopNavLink) => {
    void captureProductEvent("mobile_navigation_destination_selected", {
      sheet: sheetId,
      destination: item.id,
    });
    item.onSelect?.();
    onNavigate();
  };
  return (
    <section className="mt-2">
      {section.title && (
        <h3 className="px-1 pb-2 pt-3 text-xs font-bold uppercase tracking-wider text-fg-2">
          {section.title}
        </h3>
      )}
      <DockCard item={menu.overview} wide onSelect={select} />
      {menu.shortcuts.length > 0 && (
        <DockGroup label={t("desktop.shortcuts")} items={menu.shortcuts} mine onSelect={select} />
      )}
      {menu.groups.map((group) => (
        <DockGroup key={group.id} label={group.label} items={group.items} onSelect={select} />
      ))}
    </section>
  );
}

function DockGroup({
  label,
  items,
  mine = false,
  onSelect,
}: {
  label: string;
  items: DesktopNavLink[];
  mine?: boolean;
  onSelect: (item: DesktopNavLink) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="px-1 pb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <DockCard key={item.id} item={item} mine={mine} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function DockCard({
  item,
  wide = false,
  mine = false,
  onSelect,
}: {
  item: DesktopNavLink;
  wide?: boolean;
  mine?: boolean;
  onSelect: (item: DesktopNavLink) => void;
}) {
  const className = `group flex min-h-[3.25rem] w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary ${wide ? "items-center border-card-border bg-card-elevated" : mine ? "border-primary/35 bg-primary/5" : "border-card-border bg-background/60"}`;
  const content = (
    <>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-card-border bg-background/50 text-fg-2">
        <PixelNavIcon name={item.icon ?? pixelIconForLink(item.id)} className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">
          {item.label}
        </span>
        {item.description && (
          <span className="mt-0.5 block text-[11px] leading-snug text-muted [overflow-wrap:anywhere]">
            {item.description}
          </span>
        )}
      </span>
      {wide && (
        <span aria-hidden="true" className="text-muted">
          ›
        </span>
      )}
    </>
  );
  if (!item.href)
    return (
      <button
        type="button"
        disabled={item.disabled}
        className={`${className} disabled:cursor-wait disabled:opacity-50`}
        onClick={() => onSelect(item)}
      >
        {content}
      </button>
    );
  if (item.external)
    return (
      <a
        href={item.href}
        target={item.href.startsWith("mailto:") ? undefined : "_blank"}
        rel="noopener noreferrer"
        className={className}
        onClick={() => onSelect(item)}
      >
        {content}
      </a>
    );
  return (
    <Link href={item.href} className={className} onClick={() => onSelect(item)}>
      {content}
    </Link>
  );
}
