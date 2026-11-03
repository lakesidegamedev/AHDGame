"use client";

/**
 * Editor for the grouped-cards desktop navigation. Players reorder the
 * destinations inside each dropdown group (drag, or the arrow buttons) and pin
 * destinations to the top bar. Every change applies straight away; the navbar
 * saves it to the account.
 */

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  applySavedOrder,
  EMPTY_NAV_CUSTOMIZATION,
  MAX_NAV_PINS,
  moveItem,
  navGroupKey,
  navPinKey,
  togglePin,
  type NavCustomization,
} from "@/lib/navigation/navCustomization";
import { PixelNavIcon } from "./PixelNavIcon";
import { pixelIconForLink, type DesktopNavLink, type DesktopNavMenu } from "./desktopNavModel";

export interface CustomizableMenu {
  id: string;
  menu: DesktopNavMenu;
}

interface Props {
  menus: CustomizableMenu[];
  pinLookup: Map<string, DesktopNavLink>;
  custom: NavCustomization;
  onChange: (next: NavCustomization) => void;
  onClose: () => void;
}

const iconButton =
  "flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/5 hover:text-foreground disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-primary";

function PinStar({ filled }: { filled: boolean }) {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
    </svg>
  );
}

export function NavCustomizeDialog({ menus, pinLookup, custom, onChange, onClose }: Props) {
  const t = useTranslations("nav.customize");
  const [menuId, setMenuId] = useState(menus[0]?.id);
  const [dragging, setDragging] = useState<{ group: string; index: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const selected = menus.find((entry) => entry.id === menuId) ?? menus[0];
  const pinsFull = custom.pinned.length >= MAX_NAV_PINS;
  const pinned = custom.pinned.filter((key) => pinLookup.has(key));

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  const setGroupOrder = (key: string, ids: string[]) =>
    onChange({ ...custom, order: { ...custom.order, [key]: ids } });

  const pinButton = (key: string, label: string) => {
    const isPinned = custom.pinned.includes(key);
    return (
      <button
        type="button"
        aria-pressed={isPinned}
        disabled={!isPinned && pinsFull}
        title={isPinned ? t("unpin") : pinsFull ? t("pinsFull", { max: MAX_NAV_PINS }) : t("pin")}
        aria-label={`${isPinned ? t("unpin") : t("pin")}: ${label}`}
        onClick={() => onChange(togglePin(custom, key))}
        className={`${iconButton} ${isPinned ? "!text-primary" : ""}`}
      >
        <PinStar filled={isPinned} />
      </button>
    );
  };

  const linkLabel = (item: DesktopNavLink) => (
    <>
      <PixelNavIcon
        name={item.icon ?? pixelIconForLink(item.id)}
        className="h-4 w-4 shrink-0 text-muted"
      />
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{item.label}</span>
    </>
  );

  if (typeof document === "undefined" || !selected) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] hidden items-start justify-center bg-black/50 p-6 pt-[10vh] backdrop-blur-sm lg:flex">
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nav-customize-title"
        className="relative flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-card-border bg-card-elevated shadow-modal"
      >
        <header className="flex items-start justify-between gap-4 border-b border-card-border px-5 py-4">
          <div>
            <h2 id="nav-customize-title" className="text-base font-semibold text-foreground">
              {t("title")}
            </h2>
            <p className="mt-1 text-xs text-muted">{t("hint")}</p>
          </div>
          <button type="button" onClick={onClose} className={iconButton} aria-label={t("done")}>
            ✕
          </button>
        </header>

        {/* Pinned strip */}
        <section className="border-b border-card-border bg-background/40 px-5 py-3">
          <div className="mb-2 flex items-center justify-between text-xs text-muted">
            <span className="font-medium">{t("pinnedTitle")}</span>
            <span>
              {pinned.length}/{MAX_NAV_PINS} · {t("pinnedWideHint")}
            </span>
          </div>
          {pinned.length === 0 ? (
            <p className="text-xs text-muted">{t("pinnedEmpty")}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {pinned.map((key, index) => {
                const item = pinLookup.get(key)!;
                return (
                  <li
                    key={key}
                    className="flex items-center gap-1 rounded-lg border border-card-border bg-card py-0.5 pl-2 pr-0.5"
                  >
                    {linkLabel(item)}
                    <button
                      type="button"
                      className={iconButton}
                      disabled={index === 0}
                      aria-label={`${t("moveLeft")}: ${item.label}`}
                      onClick={() =>
                        onChange({ ...custom, pinned: moveItem(pinned, index, index - 1) })
                      }
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      className={iconButton}
                      disabled={index === pinned.length - 1}
                      aria-label={`${t("moveRight")}: ${item.label}`}
                      onClick={() =>
                        onChange({ ...custom, pinned: moveItem(pinned, index, index + 1) })
                      }
                    >
                      ›
                    </button>
                    <button
                      type="button"
                      className={iconButton}
                      aria-label={`${t("unpin")}: ${item.label}`}
                      onClick={() => onChange(togglePin(custom, key))}
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="grid min-h-0 flex-1 grid-cols-[150px_minmax(0,1fr)]">
          <nav
            className="space-y-1 border-r border-card-border bg-background/40 p-3"
            aria-label={t("menus")}
          >
            {menus.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={entry.id === selected.id}
                onClick={() => setMenuId(entry.id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] ${entry.id === selected.id ? "bg-card font-medium text-foreground" : "text-muted hover:bg-card hover:text-foreground"}`}
              >
                <span className="truncate">{entry.menu.title}</span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </nav>

          <div className="min-h-0 space-y-5 overflow-y-auto p-5">
            {selected.menu.groups.map((group) => {
              const key = navGroupKey(selected.id, group.id);
              const items = applySavedOrder(group.items, custom.order[key]);
              const roots = items.filter(
                (item) => !item.parentId || !items.some((p) => p.id === item.parentId)
              );
              const rootIds = roots.map((item) => item.id);
              return (
                <section key={group.id}>
                  <h3 className="mb-1.5 text-xs font-medium text-muted">{group.label}</h3>
                  <ol className="space-y-1">
                    {items.map((item) => {
                      const rootIndex = rootIds.indexOf(item.id);
                      const isChild = rootIndex < 0;
                      const isDragTarget =
                        dragging?.group === key && dragging.index !== rootIndex && !isChild;
                      return (
                        <li
                          key={item.id}
                          draggable={!isChild}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            setDragging({ group: key, index: rootIndex });
                          }}
                          onDragOver={(event) => {
                            if (isDragTarget) event.preventDefault();
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (dragging && isDragTarget)
                              setGroupOrder(key, moveItem(rootIds, dragging.index, rootIndex));
                            setDragging(null);
                          }}
                          onDragEnd={() => setDragging(null)}
                          className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${isChild ? "ml-6" : "cursor-grab active:cursor-grabbing"} ${dragging?.group === key && dragging.index === rootIndex ? "border-primary/60 opacity-60" : "border-card-border bg-card"}`}
                        >
                          {!isChild && (
                            <span aria-hidden="true" className="select-none text-muted">
                              ⠿
                            </span>
                          )}
                          {linkLabel(item)}
                          {!isChild && (
                            <>
                              <button
                                type="button"
                                className={iconButton}
                                disabled={rootIndex === 0}
                                aria-label={`${t("moveUp")}: ${item.label}`}
                                onClick={() =>
                                  setGroupOrder(key, moveItem(rootIds, rootIndex, rootIndex - 1))
                                }
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className={iconButton}
                                disabled={rootIndex === rootIds.length - 1}
                                aria-label={`${t("moveDown")}: ${item.label}`}
                                onClick={() =>
                                  setGroupOrder(key, moveItem(rootIds, rootIndex, rootIndex + 1))
                                }
                              >
                                ↓
                              </button>
                            </>
                          )}
                          {pinButton(navPinKey(selected.id, item.id), item.label)}
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}

            {selected.menu.shortcuts.length > 0 && (
              <section>
                <h3 className="mb-1.5 text-xs font-medium text-muted">{t("shortcuts")}</h3>
                <ul className="space-y-1">
                  {selected.menu.shortcuts.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 rounded-lg border border-card-border bg-card px-2 py-1"
                    >
                      {linkLabel(item)}
                      {pinButton(navPinKey(selected.id, item.id), item.label)}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-card-border px-5 py-3">
          <button
            type="button"
            onClick={() => onChange(EMPTY_NAV_CUSTOMIZATION)}
            className="text-xs text-muted hover:text-foreground hover:underline"
          >
            {t("reset")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center rounded-lg bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary/90"
          >
            {t("done")}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
