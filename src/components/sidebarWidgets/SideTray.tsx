"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AskDrawerSide } from "@/components/askDrawer/AskDrawerPanel";
import { useNavBottom } from "@/components/askDrawer/useNavBottom";
import type { WidgetLayout, WidgetMenu } from "@/lib/sidebarWidgets/widgetCatalog";
import { SidebarWidget, widgetBadge } from "./SidebarWidget";
import { WidgetEditor, type WidgetOption } from "./WidgetEditor";
import { useSidebarWidgetData } from "./useSidebarWidgetData";

const AskDrawerPanel = dynamic(
  () => import("@/components/askDrawer/AskDrawerPanel").then((m) => m.AskDrawerPanel),
  { ssr: false }
);

/** Open panel width. The tray sits over the page and never moves the nav or content. */
const PANEL_PX = 380;

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
      if (event.key === "Escape") show(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, show]);

  const left = side === "left";
  const edge = left ? "left-0 border-r" : "right-0 border-l";
  const bounds = { top: navBottom, bottom: "var(--status-bar-height, 0px)" };

  return (
    <>
      {!open && (
        // Closed, the tray is one small arrow tab on the edge, about a tenth of
        // the screen tall and centred between the nav and the bottom bar. The
        // full-height rail with icons, Keir and a label crowded the page edge;
        // Keir and the widgets are tabs inside the tray once it opens.
        <button
          type="button"
          onClick={() => show(true, tab)}
          aria-label={t("openTray")}
          title={t("openTray")}
          data-feedback-ignore="true"
          data-side-tray-rail
          style={{
            top: `calc((${navBottom}px + 100vh - var(--status-bar-height, 0px)) / 2)`,
            height: "clamp(44px, 10vh, 84px)",
          }}
          className={`fixed z-[44] hidden w-5 -translate-y-1/2 flex-col items-center justify-center gap-1 border border-card-border/80 bg-card/95 text-fg-2 shadow-card backdrop-blur-md transition-colors hover:bg-card-elevated hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary sm:flex ${
            left ? "left-0 rounded-r-md border-l-0" : "right-0 rounded-l-md border-r-0"
          }`}
        >
          {badge > 0 && (
            <span className="min-w-[14px] rounded-full bg-primary px-0.5 text-center text-[9px] font-bold leading-[14px] text-white">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
          {left ? (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
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
            <AskDrawerPanel
              side={side}
              onClose={() => show(false)}
              onSwapSide={onSwapSide}
              embedded
            />
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
                    show(false);
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
