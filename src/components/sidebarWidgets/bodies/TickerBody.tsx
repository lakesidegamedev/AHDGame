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
              // The side tray is about 215px inside its card. In compact mode every
              // fixed part is trimmed so a long price ("CA$86.71") and the change
              // still fit, instead of the change spilling past the card edge.
              className={`flex items-center rounded px-1 py-1 text-body-sm hover:bg-white/5 ${
                compact ? "gap-1.5" : "gap-2"
              }`}
            >
              <span
                className={`shrink-0 truncate font-semibold text-foreground ${compact ? "w-10" : "w-12"}`}
              >
                {name}
              </span>
              {compact ? (
                <span className="min-w-0 flex-1" />
              ) : (
                <span className="min-w-0 flex-1 truncate text-muted">
                  {row.ticker ? row.name : ""}
                </span>
              )}
              {row.series.length > 1 && (
                <TrendSparkline
                  values={row.series}
                  label={t("trendLabel", { name, count: row.series.length })}
                  width={compact ? 28 : 48}
                  height={16}
                  endTone={toneOfChange(row.change)}
                />
              )}
              <span className="shrink-0 tabular-nums text-foreground">
                {price(row.sharePrice, row.currencyCode)}
              </span>
              <span
                className={`shrink-0 whitespace-nowrap text-right ${compact ? "w-12" : "w-14"}`}
              >
                <Change value={row.change} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
