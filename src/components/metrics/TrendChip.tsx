"use client";

/**
 * The stored trend is the last turn's change in the metric's own unit, not a
 * percentage. Divide by the prior value so a figure in the millions and a rate
 * in single digits both read as percent change.
 */
export function trendPercent(trend: number | null | undefined, value?: number): number | null {
  if (trend == null || !Number.isFinite(trend)) return null;
  if (value === undefined) return trend;
  const prior = Math.abs(value - trend);
  return prior > 0 ? (trend / prior) * 100 : null;
}

interface TrendChipProps {
  /** Last-turn change in the metric's own unit; null/undefined or a tiny change renders "flat". */
  trend?: number | null;
  /** Current value, needed to turn the change into a percent. */
  value?: number;
  /** Whether a higher value is better (decides good/bad coloring). */
  isHigherBetter: boolean;
}

/** Percent-change chip, colored good/bad by metric direction. */
export function TrendChip({ trend: rawTrend, value, isHigherBetter }: TrendChipProps) {
  const trend = trendPercent(rawTrend, value);
  if (trend == null || Math.abs(trend) < 0.05) {
    return <span className="text-[11px] text-muted">flat</span>;
  }
  const good = isHigherBetter ? trend > 0 : trend < 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] font-semibold tabular-nums ${
        good ? "text-success" : "text-error"
      }`}
    >
      {trend > 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}%
    </span>
  );
}

export default TrendChip;
