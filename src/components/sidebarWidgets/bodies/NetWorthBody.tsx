"use client";

import { useTranslations } from "next-intl";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { NetWorthWidgetData } from "@/lib/sidebarWidgets/data/netWorth";
import { TrendSparkline } from "../MiniCharts";
import { Change, Empty, windowChange } from "./shared";

export function NetWorthBody({ data, compact }: { data: NetWorthWidgetData; compact: boolean }) {
  const t = useTranslations("nav.widgets.netWorth");
  const { currencyCode, resolveDisplayAt, formatAmountAtRates } = useCurrency();
  if (data.points.length === 0) return <Empty>{t("empty")}</Empty>;
  // Convert each point at the rate of its own turn, as the portfolio chart does.
  const ratesFor = (rate: number | null) =>
    rate !== null && data.currencyCode === currencyCode ? { [currencyCode]: rate } : undefined;
  const values = data.points.map(
    (point) => resolveDisplayAt(point.value, ratesFor(point.rate)).value
  );
  const latest = data.points[data.points.length - 1]!;
  const previous = data.points.length > 1 ? values[values.length - 2]! : null;
  const sinceLast =
    previous !== null && previous > 0
      ? ((values[values.length - 1]! - previous) / previous) * 100
      : null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-semibold tabular-nums text-foreground">
          {formatAmountAtRates(latest.value, ratesFor(latest.rate))}
        </span>
        <span className="text-xs">
          <Change value={sinceLast} /> <span className="text-muted">{t("sinceLastTurn")}</span>
        </span>
      </div>
      {values.length > 1 && (
        <>
          <TrendSparkline
            values={values}
            area
            label={t("trendLabel", { count: values.length })}
            width={compact ? 230 : 320}
            height={compact ? 36 : 48}
            format={(_, i) =>
              t("point", {
                turn: data.points[i]!.turn,
                value: formatAmountAtRates(data.points[i]!.value, ratesFor(data.points[i]!.rate)),
              })
            }
            className="h-auto w-full"
          />
          <p className="text-[11px] text-muted">
            <Change value={windowChange(values)} /> {t("overTurns", { count: values.length })}
          </p>
        </>
      )}
    </div>
  );
}
