"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { KeirSprite } from "@/components/askDrawer/KeirSprite";
import type { AskDrawerSide } from "@/components/askDrawer/AskDrawerPanel";
import { useNavBottom } from "@/components/askDrawer/useNavBottom";
import { PixelNavIcon } from "@/components/navbar/PixelNavIcon";
import type { WidgetLayout, WidgetMenu } from "@/lib/sidebarWidgets/widgetCatalog";
import { SidebarWidget, widgetBadge } from "./SidebarWidget";
import { WidgetEditor, type WidgetOption } from "./WidgetEditor";
import { useSidebarWidgetData } from "./useSidebarWidgetData";

const AskDrawerPanel = dynamic(
  () => import("@/components/askDrawer/AskDrawerPanel").then((m) => m.AskDrawerPanel),
  { ssr: false }
);

/** Collapsed rail width; the page always makes room for it. */
const RAIL_PX = 48;
/** Open panel width. Wide screens push the page over; narrower ones overlay. */
const PANEL_PX = 380;
// Below this the top bar would lose tabs to the open panel, so it overlays instead.
const PUSH_QUERY = "(min-width: 1600px)";

export const SIDE_TRAY_PUSH_VAR = "--side-tray-push";

type Tab = "widgets" | "keir";

export interface SideTrayProps {
  side: AskDrawerSide;
  onSwapSide: () => void;
  /** The player hid Ask Keir; the tray then holds widgets only. */
  keirHidden: boolean;
  layout: WidgetLayout;
  options: WidgetOption[];
  /** Desktop menus that can hold a widget for this player. */
  menus: WidgetMenu[];
  /** Placed key to the key actually fetched (home exchange resolved). */
  resolveKey: (key: string) => string;
  initialOpen: boolean;
  onSaveLayout: (layout: WidgetLayout) => void;
  onSaveOpen: (open: boolean) => void;
}

function usePushes(): boolean {
  const [pushes, setPushes] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(PUSH_QUERY);
    const update = () => setPushes(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return pushes;
}

/** Make room for the tray on its side of the page. */
function usePageRoom(side: AskDrawerSide, px: number) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.sideTray = side;
    root.style.setProperty(SIDE_TRAY_PUSH_VAR, `${px}px`);
    return () => {
      delete root.dataset.sideTray;
      root.style.removeProperty(SIDE_TRAY_PUSH_VAR);
    };
  }, [side, px]);
}

export function SideTray({
  side,
  onSwapSide,
  keirHidden,
  layout,
  options,
  menus,
  resolveKey,
  initialOpen,
  onSaveLayout,
  onSaveOpen,
}: SideTrayProps) {
  const t = useTranslations("nav.widgets.tray");
  const [open, setOpen] = useState(initialOpen);
  const [tab, setTab] = useState<Tab>("widgets");
  const [keirMounted, setKeirMounted] = useState(false);
  const [editing, setEditing] = useState(false);
  const navBottom = useNavBottom(true);
  const pushes = usePushes();
  usePageRoom(side, open && pushes ? PANEL_PX : RAIL_PX);

  const fetchKeys = layout.tray.map(resolveKey);
  const { data, loaded } = useSidebarWidgetData(fetchKeys);
  const badge = layout.tray.reduce((sum, key) => sum + widgetBadge(key, data[resolveKey(key)]), 0);

  const show = useCallback(
    (next: boolean, nextTab?: Tab) => {
      if (nextTab) setTab(nextTab);
      if (nextTab === "keir") setKeirMounted(true);
      setOpen(next);
      if (!next) setEditing(false);
      onSaveOpen(next);
    },
    [onSaveOpen]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pushes) show(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pushes, show]);

  const left = side === "left";
  const edge = left ? "left-0 border-r" : "right-0 border-l";
  const bounds = { top: navBottom, bottom: "var(--status-bar-height, 0px)" };

  return (
    <>
      {!open && (
        <nav
          aria-label={t("label")}
          data-feedback-ignore="true"
          data-side-tray-rail
          style={{ ...bounds, width: RAIL_PX }}
          className={`fixed z-[44] hidden flex-col items-center gap-2 border-card-border/80 bg-card/95 py-3 backdrop-blur-md sm:flex ${edge}`}
        >
          <button
            type="button"
            onClick={() => show(true, "widgets")}
            aria-label={t("openTray")}
            title={t("openTray")}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-fg-2 hover:bg-white/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <PixelNavIcon name="star" className="h-5 w-5" />
            {badge > 0 && (
              <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-4 text-white">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </button>
          {!keirHidden && (
            <button
              type="button"
              onClick={() => show(true, "keir")}
              aria-label="Open Ask Keir"
              title="Ask Keir about this page"
              className="flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <KeirSprite mood="idle" />
              <span className="[writing-mode:vertical-rl]">Ask</span>
            </button>
          )}
        </nav>
      )}
      <aside
        aria-label={t("label")}
        aria-hidden={!open}
        inert={!open}
        data-feedback-ignore="true"
        data-side-tray
        style={{ ...bounds, width: PANEL_PX }}
        className={`fixed z-[45] hidden max-w-[calc(100vw-1rem)] flex-col border-card-border/80 bg-card shadow-modal transition-transform duration-300 ease-out sm:flex ${edge} ${open ? "translate-x-0" : left ? "-translate-x-full" : "translate-x-full"}`}
      >
        <div className="flex shrink-0 items-center gap-1 border-b border-card-border px-2 py-1.5">
          <div role="tablist" aria-label={t("label")} className="flex flex-1 gap-1">
            <TabButton active={tab === "widgets"} onClick={() => setTab("widgets")}>
              {t("widgets")}
            </TabButton>
            {!keirHidden && (
              <TabButton
                active={tab === "keir"}
                onClick={() => {
                  setKeirMounted(true);
                  setTab("keir");
                }}
              >
                {t("keir")}
              </TabButton>
            )}
          </div>
          {tab === "widgets" && (
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              aria-pressed={editing}
              className="rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-white/5 hover:text-foreground"
            >
              {editing ? t("done") : t("edit")}
            </button>
          )}
          <button
            type="button"
            onClick={onSwapSide}
            aria-label={t("swapSide")}
            title={t("swapSide")}
            className="rounded-md px-2 py-1 text-sm text-muted hover:bg-white/5 hover:text-foreground"
          >
            ⇄
          </button>
          <button
            type="button"
            onClick={() => show(false)}
            aria-label={t("close")}
            title={t("close")}
            className="rounded-md px-2 py-1 text-lg leading-none text-muted hover:bg-white/5 hover:text-foreground"
          >
            ×
          </button>
        </div>
        <div className={`min-h-0 flex-1 ${tab === "keir" ? "flex flex-col" : "hidden"}`}>
          {keirMounted && !keirHidden && (
            <AskDrawerPanel side={side} onClose={() => show(false)} onSwapSide={onSwapSide} />
          )}
        </div>
        {tab === "widgets" && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3">
            {editing ? (
              <WidgetEditor
                layout={layout}
                options={options}
                menus={menus}
                onChange={onSaveLayout}
              />
            ) : layout.tray.length === 0 ? (
              <div className="rounded-lg border border-dashed border-card-border p-4 text-center">
                <p className="text-sm text-muted">{t("empty")}</p>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="mt-3 rounded-md border border-card-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/5"
                >
                  {t("add")}
                </button>
              </div>
            ) : (
              layout.tray.map((key) => (
                <SidebarWidget
                  key={key}
                  widgetKey={key}
                  data={data[resolveKey(key)]}
                  loaded={loaded(resolveKey(key))}
                  exchangeLabel={options.find((option) => option.key === key)?.label}
                  onNavigate={() => {
                    if (!pushes) show(false);
                  }}
                />
              ))
            )}
          </div>
        )}
      </aside>
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "bg-card-elevated text-foreground" : "text-muted hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}
