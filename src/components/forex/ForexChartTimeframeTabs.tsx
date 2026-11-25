"use client";

import {
  FOREX_CHART_TIMEFRAME_LABELS,
  type ForexChartTimeframe,
} from "@/components/forex/forexChartTimeframe";
import { PILL_TRACK, pillClass } from "@/components/ui/selectedState";

interface TimeframeTabsProps {
  value: ForexChartTimeframe;
  onChange: (next: ForexChartTimeframe) => void;
  /** Optional prefix for stable ids when multiple charts on one page */
  idPrefix?: string;
}

export function ForexChartTimeframeTabs({
  value,
  onChange,
  idPrefix = "fx-chart",
}: TimeframeTabsProps) {
  const order: ForexChartTimeframe[] = ["24h", "48h", "5y", "all"];
  return (
    <div className={`${PILL_TRACK} flex-wrap`} role="tablist" aria-label="Chart timeframe">
      {order.map((tf) => (
        <button
          key={tf}
          type="button"
          role="tab"
          id={`${idPrefix}-tf-${tf}`}
          aria-selected={value === tf}
          onClick={() => onChange(tf)}
          className={`whitespace-nowrap px-2.5 py-1.5 text-xs ${pillClass(value === tf)}`}
        >
          {FOREX_CHART_TIMEFRAME_LABELS[tf]}
        </button>
      ))}
    </div>
  );
}
