"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CURRENCY_SYMBOLS } from "@/lib/constants/currencyCodes";
import { formatCurrencyPrecise, formatSharePrice } from "@/lib/utils/formattersCore";
import type { WatchlistRow, WatchlistWidgetData } from "@/lib/sidebarWidgets/data/watchlist";
import { useWatchlist } from "../useWatchlist";

function rowHref(row: WatchlistRow): string {
  return row.kind === "corporation" ? `/corporation/${row.id}` : `/commodity/${row.id}`;
}

function rowValue(row: WatchlistRow): string {
  if (row.value === null) return "";
  if (row.kind === "commodity") return formatCurrencyPrecise(row.value);
  return formatSharePrice(
    row.value,
    row.currencyCode ? (CURRENCY_SYMBOLS[row.currencyCode] ?? "$") : "$"
  );
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">·</span>;
  const up = value >= 0;
  return (
    <span className={`tabular-nums ${up ? "text-success" : "text-error"}`}>
      {up ? "▲" : "▼"}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export function WatchlistBody({
  data,
  compact,
  onNavigate,
}: {
  data: WatchlistWidgetData;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav.widgets.watchlist");
  const watchlist = useWatchlist();
  // Rows the player just removed disappear before the next refresh.
  const rows = data.rows.filter((row) => watchlist.isWatched(row));
  if (rows.length === 0) return <p className="text-xs leading-relaxed text-muted">{t("empty")}</p>;
  return (
    <ul className="space-y-0.5">
      {rows.map((row) => {
        const name = row.name ?? t("missing");
        return (
          <li key={`${row.kind}:${row.id}`} className="flex items-center gap-1">
            {row.name === null ? (
              <span className="flex min-w-0 flex-1 px-1 py-1 text-xs text-muted">{name}</span>
            ) : (
              <Link
                href={rowHref(row)}
                onClick={onNavigate}
                className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-xs hover:bg-white/5"
              >
                <span
                  className={`shrink-0 truncate font-semibold text-foreground ${compact ? "w-20" : "w-24"}`}
                >
                  {row.ticker ?? name}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {!compact && row.ticker ? name : ""}
                </span>
                <span className="shrink-0 tabular-nums text-foreground">
                  {row.value === null && row.kind === "corporation" ? t("private") : rowValue(row)}
                </span>
                <span className="w-14 shrink-0 text-right">
                  <Change value={row.change} />
                </span>
              </Link>
            )}
            <button
              type="button"
              onClick={() => watchlist.remove(row)}
              aria-label={t("remove", { name })}
              title={t("remove", { name })}
              className="shrink-0 rounded px-1.5 py-1 text-xs text-muted hover:bg-white/5 hover:text-foreground"
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
