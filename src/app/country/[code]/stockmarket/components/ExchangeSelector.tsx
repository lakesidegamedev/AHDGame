"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { ExchangeFilter } from "../types";
import type { ExchangeMetaEntry } from "../stockMarketRouting";
import { PILL_TRACK, pillClass } from "@/components/ui/selectedState";

export interface ExchangeCompareRow {
  listings: number;
  marketCap: number;
}

interface ExchangeSelectorProps {
  exchangeMeta: Record<string, ExchangeMetaEntry>;
  exchangeFilter: ExchangeFilter;
  onSelect: (key: string) => void;
  /** Lazily loaded per-exchange size data for the compare panel. */
  compareData?: Record<string, ExchangeCompareRow>;
  compareLoading?: boolean;
  compareOpen?: boolean;
  onToggleCompare?: () => void;
}

/**
 * Country / Global filter for the stock-market hero.
 *
 * Desktop (sm+): inline pill row, one button per exchange. Original behavior.
 * Mobile (< sm): compact chip showing the current selection with a chevron that
 * opens a dropdown of the other exchanges. Avoids the row of buttons overflowing
 * the viewport on phones.
 */
export function ExchangeSelector({
  exchangeMeta,
  exchangeFilter,
  onSelect,
  compareData,
  compareLoading,
  compareOpen,
  onToggleCompare,
}: ExchangeSelectorProps) {
  const entries = Object.entries(exchangeMeta);
  const currentEntry = exchangeMeta[exchangeFilter] ?? exchangeMeta.global;
  const currentLabel = exchangeFilter === "global" ? "Global" : (currentEntry?.title ?? "Global");
  const { formatAmount } = useCurrency();

  return (
    <div className="flex max-w-full min-w-0 flex-col items-end gap-2">
      <div className="flex max-w-full min-w-0 items-center gap-2">
        {onToggleCompare && entries.length > 2 && (
          <button
            type="button"
            onClick={onToggleCompare}
            aria-expanded={compareOpen ?? false}
            title="Compare exchanges by listings and market cap"
            className={`rounded-lg px-3 py-1.5 border text-body-sm font-bold uppercase tracking-wider transition-colors ${
              compareOpen
                ? "border-card-border bg-card-elevated text-foreground"
                : "border-card-border bg-card text-muted hover:bg-card-elevated hover:text-foreground"
            }`}
          >
            Compare
          </button>
        )}
        {/* Desktop: inline pill row */}
        <div
          role="group"
          aria-label="Stock exchange"
          className="hidden max-w-full overflow-x-auto rounded-lg sm:block"
        >
          <div className={`${PILL_TRACK} w-max border border-card-border`}>
            {entries.map(([key, val]) => (
              <button
                key={key}
                onClick={() => onSelect(key)}
                aria-pressed={exchangeFilter === key}
                className={`px-3 py-1 text-body-sm font-bold uppercase tracking-wider ${pillClass(
                  exchangeFilter === key
                )}`}
              >
                {key === "global" ? "Global" : val.title}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile: compact chip + dropdown */}
        <MobileExchangeDropdown
          entries={entries}
          exchangeFilter={exchangeFilter}
          currentLabel={currentLabel}
          onSelect={onSelect}
        />
      </div>

      {compareOpen && (
        <div className="w-full min-w-64 rounded-lg border border-card-border bg-card shadow-xl py-1">
          {compareLoading && (
            <p className="px-3 py-2 text-body-sm text-muted">Loading exchange sizes…</p>
          )}
          {!compareLoading &&
            entries.map(([key, val]) => {
              const label = key === "global" ? "Global" : val.title;
              const row = compareData?.[key];
              const active = exchangeFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelect(key)}
                  className={`w-full flex items-center justify-between gap-4 px-3 py-2 text-body-sm transition-colors ${
                    active
                      ? "bg-card-elevated text-foreground"
                      : "text-muted hover:bg-card-elevated hover:text-foreground"
                  }`}
                >
                  <span className="font-bold uppercase tracking-wider">{label}</span>
                  <span className="tabular-nums text-muted">
                    {row
                      ? `${row.listings.toLocaleString("en-US")} · ${formatAmount(row.marketCap)}`
                      : "—"}
                  </span>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}

interface MenuPosition {
  /** Distance from the viewport top, when anchored below the trigger. */
  top?: number;
  /** Distance from the viewport bottom, when flipped above the trigger. */
  bottom?: number;
  /** Right-aligned to the trigger's right edge. */
  right: number;
  /** Hard cap so the list always fits on screen; scrolls past it. */
  maxHeight: number;
}

function MobileExchangeDropdown({
  entries,
  exchangeFilter,
  currentLabel,
  onSelect,
}: {
  entries: Array<[string, ExchangeMetaEntry]>;
  exchangeFilter: ExchangeFilter;
  currentLabel: string;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted] = useState(() => typeof window !== "undefined");

  // The dropdown is portaled to <body> so the hero header's `overflow-hidden`
  // (rounded image) cannot clip the last exchanges. Position it manually,
  // anchored to the trigger, flipping above when there isn't room below.
  const computePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const gap = 8; // matches the previous `mt-2`
    const margin = 8; // viewport breathing room
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const right = window.innerWidth - r.right;

    if (spaceBelow >= spaceAbove) {
      setPosition({ top: r.bottom + gap, right, maxHeight: spaceBelow - gap - margin });
    } else {
      setPosition({
        bottom: window.innerHeight - r.top + gap,
        right,
        maxHeight: spaceAbove - gap - margin,
      });
    }
  }, []);

  const toggle = useCallback(() => {
    // Position before the first paint so the menu never flashes unplaced.
    if (!open) computePosition();
    setOpen((v) => !v);
  }, [open, computePosition]);

  // Keep the menu anchored to the trigger while open as the page scrolls/resizes.
  useEffect(() => {
    if (!open) return;
    const onChange = () => computePosition();
    window.addEventListener("scroll", onChange, true);
    window.addEventListener("resize", onChange);
    return () => {
      window.removeEventListener("scroll", onChange, true);
      window.removeEventListener("resize", onChange);
    };
  }, [open, computePosition]);

  // Close on outside click / Escape. The menu lives in a portal, so check both
  // the trigger and the menu before treating a click as "outside".
  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const menu = open && position && (
    <div
      ref={menuRef}
      role="listbox"
      style={{
        position: "fixed",
        top: position.top,
        bottom: position.bottom,
        right: position.right,
        maxHeight: position.maxHeight,
      }}
      className="z-[60] min-w-[10rem] overflow-y-auto rounded-lg border border-card-border bg-card shadow-xl py-1"
    >
      {entries.map(([key, val]) => {
        const label = key === "global" ? "Global" : val.title;
        const active = exchangeFilter === key;
        return (
          <button
            key={key}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => {
              onSelect(key);
              setOpen(false);
            }}
            className={`w-full text-left px-3 py-2 text-body-sm font-bold uppercase tracking-wider transition-colors ${
              active
                ? "bg-card-elevated text-foreground"
                : "text-muted hover:bg-card-elevated hover:text-foreground"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="relative sm:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Exchange filter, currently ${currentLabel}`}
        className="flex items-center gap-1.5 rounded-lg border border-card-border bg-card px-3 py-1.5 text-body-sm font-bold uppercase tracking-wider text-foreground"
      >
        <span>{currentLabel}</span>
        <svg
          className={`h-3 w-3 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {mounted && typeof document !== "undefined" && menu && createPortal(menu, document.body)}
    </div>
  );
}
