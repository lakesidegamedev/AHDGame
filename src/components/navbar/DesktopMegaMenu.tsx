"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { captureProductEvent } from "@/lib/analytics/capture";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { DesktopNavigationLayout } from "@/lib/navigation/desktopNavigationLayout";
import { PixelNavIcon } from "./PixelNavIcon";
import { pixelIconForLink, type DesktopNavLink, type DesktopNavMenu } from "./desktopNavModel";

/** Space kept between the panel and the viewport edge. */
const EDGE_GAP = 16;
const GROUP_COLUMN = 250;
const SIDE_COLUMN = 220;
/** The side column widens when it holds a widget. */
const WIDGET_SIDE_COLUMN = 260;

/** Wide enough for its card columns (at most three) and the side column, no wider. */
export function panelWidth(groupCount: number, hasWidget = false): number {
  const side = hasWidget ? WIDGET_SIDE_COLUMN : SIDE_COLUMN;
  return Math.max(520, Math.min(3, Math.max(1, groupCount)) * GROUP_COLUMN + side + 32);
}

/** Centred under the tab that opened it, nudged inward to stay on screen. */
export function anchoredLeft(
  tab: { left: number; width: number },
  width: number,
  viewportWidth: number
): number {
  const centred = tab.left + tab.width / 2 - width / 2;
  return Math.min(
    Math.max(EDGE_GAP, centred),
    Math.max(EDGE_GAP, viewportWidth - width - EDGE_GAP)
  );
}

interface Props {
  menu: DesktopNavMenu;
  menuId: string;
  layout: Exclude<DesktopNavigationLayout, "standard">;
  anchorRef: RefObject<HTMLDivElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  /** Item ids from this menu that are pinned to the top bar. */
  pinnedIds?: Set<string>;
  pinsFull?: boolean;
  onTogglePin?: (itemId: string) => void;
  onCustomize?: () => void;
  /** Experimental widget the player placed in this menu's side column. */
  widget?: ReactNode;
}

export function DesktopMegaMenu({
  menu,
  menuId,
  layout,
  anchorRef,
  panelRef,
  onClose,
  pinnedIds,
  pinsFull = false,
  onTogglePin,
  onCustomize,
  widget,
}: Props) {
  const t = useTranslations("nav.desktop");
  const pathname = usePathname();
  const hasWidget = !!widget;
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const focused = useRef(false);

  useLayoutEffect(() => {
    let frame = 0;
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) {
        frame = requestAnimationFrame(update);
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(
        panelWidth(menu.groups.length, hasWidget),
        window.innerWidth - 2 * EDGE_GAP
      );
      const top = Math.max(8, rect.bottom + 8);
      setPosition({
        top,
        width,
        left: anchoredLeft(rect, width, window.innerWidth),
        height: Math.max(80, window.innerHeight - top - 16),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, menu.groups.length, hasWidget]);

  useLayoutEffect(() => {
    if (!position || focused.current || !window.matchMedia("(min-width: 1024px)").matches) return;
    focused.current = true;
    panelRef.current
      ?.querySelector<HTMLElement>("a, button:not(:disabled)")
      ?.focus({ preventScroll: true });
  }, [position, panelRef]);

  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      void captureProductEvent("desktop_navigation_menu_opened", { layout, menu: menuId });
    }
  }, [layout, menuId]);

  function row(item: DesktopNavLink, compact = false) {
    if (!onTogglePin || item.disabled || !item.href) return linkRow(item, compact);
    const pinned = pinnedIds?.has(item.id) ?? false;
    return (
      <div key={item.id} className="group/pin relative">
        {linkRow(item, compact, true)}
        <button
          type="button"
          aria-pressed={pinned}
          disabled={!pinned && pinsFull}
          aria-label={`${pinned ? t("unpin") : t("pin")}: ${item.label}`}
          title={pinned ? t("unpin") : pinsFull ? t("pinsFull") : t("pin")}
          onClick={() => onTogglePin(item.id)}
          className={`absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md transition-opacity hover:bg-white/5 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary disabled:hidden ${pinned ? "text-primary opacity-100" : "text-muted opacity-0 hover:text-foreground group-hover/pin:opacity-100"}`}
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill={pinned ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
          </svg>
        </button>
      </div>
    );
  }

  function linkRow(item: DesktopNavLink, compact = false, pinnable = false) {
    const active =
      item.href && !item.external && !item.href.includes("?") && pathname === item.href;
    const content = (
      <>
        <span
          className={`flex shrink-0 items-center justify-center text-muted group-hover:text-foreground group-focus-visible:text-foreground ${compact ? "h-5 w-5" : "h-8 w-8 rounded-md border border-card-border bg-background/50"}`}
        >
          <PixelNavIcon
            name={item.icon ?? pixelIconForLink(item.id)}
            className={compact ? "h-4 w-4" : "h-5 w-5"}
          />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-medium leading-snug text-foreground [overflow-wrap:anywhere]">
            {item.label}
          </span>
          {!compact && item.description && (
            <span className="mt-0.5 block text-xs leading-snug text-muted [overflow-wrap:anywhere]">
              {item.description}
            </span>
          )}
        </span>
      </>
    );
    const className = `${["patreon", "supporters"].includes(item.id) ? "store-purchase-cta " : ""}group flex w-full items-center gap-2.5 rounded-lg border text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary ${compact ? "px-2 py-2" : "p-2.5"} ${item.parentId ? "ml-3 !w-[calc(100%-0.75rem)]" : ""} ${pinnable ? "pr-10" : ""} ${active ? "border-card-border bg-card" : "border-transparent hover:border-card-border hover:bg-card"}`;
    const select = () => {
      void captureProductEvent("desktop_navigation_destination_selected", {
        layout,
        menu: menuId,
        destination: item.id,
      });
      item.onSelect?.();
      onClose();
    };
    if (!item.href)
      return (
        <button
          key={item.id}
          type="button"
          disabled={item.disabled}
          className={`${className} disabled:cursor-wait disabled:opacity-50`}
          onClick={select}
        >
          {content}
        </button>
      );
    if (item.external)
      return (
        <a
          key={item.id}
          href={item.href}
          target={item.href.startsWith("mailto:") ? undefined : "_blank"}
          rel="noopener noreferrer"
          className={className}
          onClick={select}
        >
          {content}
          <span aria-hidden="true" className="ml-auto text-muted">
            ↗
          </span>
        </a>
      );
    return (
      <Link
        key={item.id}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={className}
        onClick={select}
      >
        {content}
      </Link>
    );
  }

  const shortcuts = menu.shortcuts.length > 0 && (
    <div>
      <p className="mb-2 text-xs font-medium text-muted">{t("shortcuts")}</p>
      <div className="space-y-0.5">{menu.shortcuts.map((item) => row(item, true))}</div>
    </div>
  );
  const overview = (
    <div className="rounded-lg border border-card-border bg-card p-3.5">
      <PixelNavIcon
        name={menu.overview.icon ?? pixelIconForLink(menu.overview.id)}
        className="mb-3 h-7 w-7 text-foreground"
      />
      <p className="text-sm font-semibold text-foreground">{menu.overview.label}</p>
      {menu.overview.description && (
        <p className="mt-1 text-xs leading-relaxed text-muted">{menu.overview.description}</p>
      )}
      <Link
        href={menu.overview.href!}
        onClick={onClose}
        className="mt-3 inline-flex items-center gap-3 text-xs font-medium text-foreground hover:underline"
      >
        {t("openOverview")}
        <span aria-hidden="true">↗</span>
      </Link>
    </div>
  );
  const rail = (
    <aside className="flex flex-col gap-5 border-l border-card-border bg-background/40 p-4">
      {widget}
      {shortcuts}
      {overview}
    </aside>
  );
  const groups = (
    <div
      className={`grid min-w-0 gap-2 p-4 ${menu.groups.length >= 3 ? "grid-cols-3" : menu.groups.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}
    >
      {menu.groups.map((group) => (
        <section key={group.id} className="min-w-0">
          <h3 className="mb-2 px-2.5 text-xs font-medium text-muted">{group.label}</h3>
          {group.items.map((item) => row(item))}
        </section>
      ))}
    </div>
  );

  if (!position || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={panelRef}
      data-desktop-mega-menu={layout}
      role="region"
      aria-label={menu.title}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        width: position.width,
        maxHeight: position.height,
      }}
      className="z-[70] hidden overflow-y-auto overscroll-contain rounded-xl border border-card-border bg-card-elevated shadow-modal lg:block"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const elements = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>("a, button:not(:disabled)") ?? []
        );
        if (
          (event.shiftKey && event.target === elements[0]) ||
          (!event.shiftKey && event.target === elements.at(-1))
        ) {
          const trigger = anchorRef.current?.querySelector<HTMLElement>("button");
          const controls = Array.from(
            trigger?.closest("nav")?.querySelectorAll<HTMLElement>("a, button:not(:disabled)") ?? []
          );
          const next = trigger && controls[controls.indexOf(trigger) + 1];
          event.preventDefault();
          onClose();
          (event.shiftKey ? trigger : next || trigger)?.focus();
        }
      }}
    >
      <div className="flex items-center justify-between gap-4 border-b border-card-border px-5 py-3">
        <span className="text-sm font-medium text-foreground">{menu.title}</span>
      </div>
      <div
        className={`grid ${widget ? "grid-cols-[minmax(0,1fr)_260px]" : "grid-cols-[minmax(0,1fr)_220px]"}`}
      >
        {groups}
        {rail}
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-card-border px-5 py-2 text-xs text-muted">
        <span>{t("keyboardHint")}</span>
        {onCustomize ? (
          <button
            type="button"
            onClick={() => {
              onClose();
              onCustomize();
            }}
            className="hover:text-foreground hover:underline"
          >
            {t("editNavigation")}
          </button>
        ) : (
          <Link
            href="/settings?section=experimental"
            onClick={onClose}
            className="hover:text-foreground hover:underline"
          >
            {t("changeLayout")}
          </Link>
        )}
      </div>
    </div>,
    document.body
  );
}
