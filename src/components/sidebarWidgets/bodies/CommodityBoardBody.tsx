"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { CommodityBoardWidgetData } from "@/lib/sidebarWidgets/data/commodityBoard";
import { toneOfChange, TrendSparkline } from "../MiniCharts";
import { Change, Empty } from "./shared";

export function CommodityBoardBody({
  data,
  compact,
  onNavigate,
}: {
  data: CommodityBoardWidgetData;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav.widgets.commodityBoard");
  const { formatPrice } = useCurrency();
  if (data.rows.length === 0) return <Empty>{t("empty")}</Empty>;
  return (
    <ul className="space-y-0.5">
      {data.rows.slice(0, compact ? 6 : 8).map((row) => (
        <li key={row.commodity}>
          <Link
            href={`/commodity/${row.commodity}`}
            onClick={onNavigate}
            className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-white/5"
          >
            <span className="min-w-0 flex-1 truncate text-foreground">{row.label}</span>
            {row.series.length > 1 && (
              <TrendSparkline
                values={row.series}
                label={t("trendLabel", { commodity: row.label, count: row.series.length })}
                width={compact ? 36 : 56}
                height={16}
                endTone={toneOfChange(row.change)}
              />
            )}
            <span className="shrink-0 tabular-nums text-foreground">{formatPrice(row.price)}</span>
            <span className="w-14 shrink-0 text-right">
              <Change value={row.change} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
