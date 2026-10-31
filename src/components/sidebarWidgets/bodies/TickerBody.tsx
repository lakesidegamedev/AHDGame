"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { StockTickerWidgetData } from "@/lib/sidebarWidgets/widgetData";
import { toneOfChange, TrendSparkline } from "../MiniCharts";
import { Change, Empty, price } from "./shared";

export function TickerBody({
  data,
  compact,
  onNavigate,
}: {
  data: StockTickerWidgetData;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav.widgets.stockTicker");
  if (data.rows.length === 0) return <Empty>{t("empty")}</Empty>;
  return (
    <ul className="space-y-0.5">
      {data.rows.slice(0, compact ? 5 : 8).map((row) => {
        const name = row.ticker ?? row.name;
        return (
          <li key={row.sequentialId}>
            <Link
              href={`/corporation/${row.sequentialId}`}
              onClick={onNavigate}
              className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-white/5"
            >
              <span className="w-12 shrink-0 truncate font-semibold text-foreground">{name}</span>
              {compact ? (
                <span className="flex-1" />
              ) : (
                <span className="min-w-0 flex-1 truncate text-muted">
                  {row.ticker ? row.name : ""}
                </span>
              )}
              {row.series.length > 1 && (
                <TrendSparkline
                  values={row.series}
                  label={t("trendLabel", { name, count: row.series.length })}
                  width={compact ? 36 : 48}
                  height={16}
                  endTone={toneOfChange(row.change)}
                />
              )}
              <span className="shrink-0 tabular-nums text-foreground">
                {price(row.sharePrice, row.currencyCode)}
              </span>
              <span className="w-14 shrink-0 text-right">
                <Change value={row.change} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
