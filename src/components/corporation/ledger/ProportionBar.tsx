import { pctWidth } from "./seriesColours";
import type { MeterTone } from "./TickMeter";

const FILL: Record<MeterTone | "muted", string> = {
  foreground: "bg-foreground",
  success: "bg-success",
  error: "bg-error",
  warning: "bg-warning",
  gold: "bg-gold",
  info: "bg-info",
  muted: "bg-muted",
};

/** A thin decorative bar showing a share of a whole; the figure beside it carries the value. */
export function ProportionBar({
  pct,
  tone = "foreground",
  className = "",
}: {
  pct: number;
  tone?: MeterTone | "muted";
  className?: string;
}) {
  return (
    <div aria-hidden className={`h-1.5 w-full overflow-hidden rounded-[1px] bg-track ${className}`}>
      <div data-fill className={`h-full ${FILL[tone]}`} style={{ width: pctWidth(pct) }} />
    </div>
  );
}
