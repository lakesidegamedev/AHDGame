import Link from "next/link";
import type { ReactNode } from "react";
import { type LedgerSegment, positiveTotal, seriesBg, seriesStroke } from "./seriesColours";

/** Circumference of a circle with r = 15.915, so dash lengths read as percents. */
const RADIUS = 15.915;
const GAP = 0.8;

/**
 * A ring chart with its centre label and a legend listing every segment's
 * value and share. Renders nothing when there is nothing to divide.
 */
export function RingChart({
  segments,
  centreLabel,
  centreValue,
  label,
  legendExtra,
  legend = true,
}: {
  segments: LedgerSegment[];
  centreLabel: string;
  centreValue: string;
  label: string;
  legendExtra?: (segment: LedgerSegment) => ReactNode;
  /** False when a table beside the ring already names every segment. */
  legend?: boolean;
}) {
  const shown = segments.filter((s) => Number.isFinite(s.value) && s.value > 0);
  const total = positiveTotal(shown.map((s) => s.value));
  if (total <= 0) return null;

  const pcts = shown.map((s) => (s.value / total) * 100);
  const arcs = shown.map((segment, i) => {
    const pct = pcts[i];
    const start = pcts.slice(0, i).reduce((sum, p) => sum + p, 0);
    const length = shown.length > 1 ? Math.max(pct - GAP, 0.4) : 100;
    return { segment, pct, length, offset: 25 - start };
  });

  return (
    <div className="min-w-0">
      <div className="relative mx-auto h-[150px] w-[150px]">
        <svg viewBox="0 0 42 42" className="h-full w-full" role="img" aria-label={label}>
          <circle
            cx="21"
            cy="21"
            r={RADIUS}
            fill="none"
            strokeWidth={6.5}
            className="stroke-track"
          />
          {arcs.map(({ segment, length, offset }) => (
            <circle
              key={segment.key}
              data-arc
              cx="21"
              cy="21"
              r={RADIUS}
              fill="none"
              strokeWidth={6.5}
              strokeDasharray={`${length} ${100 - length}`}
              strokeDashoffset={offset}
              className={segment.color ? undefined : seriesStroke(segment.tone ?? "info")}
              style={segment.color ? { stroke: segment.color } : undefined}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          {centreLabel && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
              {centreLabel}
            </span>
          )}
          {centreValue && (
            <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
              {centreValue}
            </span>
          )}
        </div>
      </div>
      {legend && (
        <ul className="mt-3">
          {arcs.map(({ segment, pct }) => (
            <li
              key={segment.key}
              className="flex min-h-8 items-center gap-2 border-b border-card-border/60 text-xs"
            >
              <span
                aria-hidden
                className={`h-2.5 w-2.5 shrink-0 rounded-[2px] ${
                  segment.color ? "" : seriesBg(segment.tone ?? "info")
                }`}
                style={segment.color ? { background: segment.color } : undefined}
              />
              <span data-legend-name className="min-w-0 flex-1 truncate text-muted">
                {segment.href ? (
                  <Link href={segment.href} className="hover:text-foreground hover:underline">
                    {segment.label}
                  </Link>
                ) : (
                  segment.label
                )}
                {segment.isYou && <span className="ml-1 text-foreground">(you)</span>}
              </span>
              {legendExtra?.(segment)}
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {segment.display}
              </span>
              <span className="w-12 text-right font-mono tabular-nums text-muted">
                {pct.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
