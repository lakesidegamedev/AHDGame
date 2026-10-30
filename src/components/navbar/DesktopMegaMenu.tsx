"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { captureProductEvent } from "@/lib/analytics/capture";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { DesktopNavigationLayout } from "@/lib/navigation/desktopNavigationLayout";
import { PixelNavIcon } from "./PixelNavIcon";
import { pixelIconForLink, type DesktopNavLink, type DesktopNavMenu } from "./desktopNavModel";

interface Props {
  menu: DesktopNavMenu;
  menuId: string;
  layout: Exclude<DesktopNavigationLayout, "standard">;
  anchorRef: RefObject<HTMLDivElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

export function DesktopMegaMenu({ menu, menuId, layout, anchorRef, panelRef, onClose }: Props) {
  const t = useTranslations("nav.desktop");
  const pathname = usePathname();
  const [section, setSection] = useState(menu.groups[0]?.id);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const focused = useRef(false);
  const selectedGroup = menu.groups.find((group) => group.id === section) ?? menu.groups[0];

  useLayoutEffect(() => {
    let frame = 0;
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) {
        frame = requestAnimationFrame(update);
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const desiredWidth = menu.groups.length === 1 ? 760 : layout === "directory" ? 1000 : 1080;
      const width = Math.min(desiredWidth, window.innerWidth - 32);
      const top = Math.max(8, rect.bottom + 8);
      setPosition({
        top,
        width,
        left: (window.innerWidth - width) / 2,
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
  }, [anchorRef, layout, menu.groups.length]);

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
    const className = `${["patreon", "supporters"].includes(item.id) ? "store-purchase-cta " : ""}group flex w-full items-center gap-2.5 rounded-lg border text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary ${compact ? "px-2 py-2" : "p-2.5"} ${item.parentId ? "ml-3 !w-[calc(100%-0.75rem)]" : ""} ${active ? "border-card-border bg-card" : "border-transparent hover:border-card-border hover:bg-card"}`;
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
      <div
        className={
          layout === "directory"
            ? "flex flex-wrap gap-1 [&>a]:w-auto [&>a]:border-card-border [&>a]:bg-card"
            : "space-y-0.5"
        }
      >
        {menu.shortcuts.map((item) => row(item, true))}
      </div>
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
          {group.items.map((item) => row(item, layout === "directory"))}
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
        <span className="text-xs text-muted">{t(`layouts.${layout}`)}</span>
      </div>
      {layout === "cards" && (
        <div className="grid grid-cols-[minmax(0,1fr)_220px]">
          {groups}
          {rail}
        </div>
      )}
      {layout === "browser" && (
        <div className="grid grid-cols-[160px_minmax(0,1fr)_220px]">
          <div
            className="space-y-1 border-r border-card-border bg-background/40 p-3"
            role="group"
            aria-label={t("sections")}
          >
            {menu.groups.map((group) => (
              <button
                key={group.id}
                type="button"
                aria-pressed={selectedGroup?.id === group.id}
                onClick={() => setSection(group.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-[13px] ${selectedGroup?.id === group.id ? "bg-card font-medium text-foreground" : "text-muted hover:bg-card hover:text-foreground"}`}
              >
                {group.label}
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
          <section className="min-w-0 p-5" aria-live="polite">
            <h3 className="mb-4 text-base font-semibold text-foreground">{selectedGroup?.label}</h3>
            <div className="grid grid-cols-2 gap-2">
              {selectedGroup?.items.map((item) => row(item))}
            </div>
          </section>
          {rail}
        </div>
      )}
      {layout === "directory" && (
        <div className="grid grid-cols-[190px_minmax(0,1fr)]">
          <aside className="border-r border-card-border bg-background/40 p-4">{overview}</aside>
          <div className="min-w-0">
            {groups}
            {shortcuts && <div className="border-t border-card-border px-5 py-3">{shortcuts}</div>}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-4 border-t border-card-border px-5 py-2 text-xs text-muted">
        <span>{t("keyboardHint")}</span>
        <Link
          href="/settings?section=experimental"
          onClick={onClose}
          className="hover:text-foreground hover:underline"
        >
          {t("changeLayout")}
        </Link>
      </div>
    </div>,
    document.body
  );
}
