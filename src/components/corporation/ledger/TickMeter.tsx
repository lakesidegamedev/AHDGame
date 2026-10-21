import { clampPct, pctWidth } from "./seriesColours";

export type MeterTone = "foreground" | "success" | "error" | "warning" | "gold" | "info";

const FILL: Record<MeterTone, string> = {
  foreground: "bg-foreground",
  success: "bg-success",
  error: "bg-error",
  warning: "bg-warning",
  gold: "bg-gold",
  info: "bg-info",
};

/** A 0..100 meter with tick marks, for scores and fill rates. */
export function TickMeter({
  pct,
  tone = "foreground",
  ticks = [25, 50, 75],
  label,
  className = "",
}: {
  pct: number;
  tone?: MeterTone;
  ticks?: number[];
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative h-[5px] w-full overflow-hidden rounded-[1px] bg-track ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <div data-fill className={`h-full ${FILL[tone]}`} style={{ width: pctWidth(pct) }} />
      {ticks.map((t) => (
        <span
          key={t}
          className="absolute inset-y-0 w-[1.5px] bg-background"
          style={{ left: `${clampPct(t)}%` }}
        />
      ))}
    </div>
  );
}
