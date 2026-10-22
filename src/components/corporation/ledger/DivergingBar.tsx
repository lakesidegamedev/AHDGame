import { pctWidth } from "./seriesColours";

/**
 * A change drawn from a centre line: right and success-toned for a rise, left
 * and error-toned for a fall, no fill when flat. `scale` is the magnitude that
 * fills one half, usually the largest change in the table.
 */
export function DivergingBar({
  value,
  scale,
  label,
  className = "",
}: {
  value: number;
  scale: number;
  label: string;
  className?: string;
}) {
  const flat = !Number.isFinite(value) || Math.abs(value) < 1e-9;
  const direction = flat ? "flat" : value > 0 ? "up" : "down";
  const half = flat || !(scale > 0) ? 0 : Math.min(Math.abs(value) / scale, 1) * 100;
  return (
    <div
      role="img"
      aria-label={label}
      data-direction={direction}
      className={`relative flex h-2 w-full ${className}`}
    >
      <div className="flex flex-1 justify-end bg-track/60">
        {direction === "down" && (
          <div data-fill className="h-full bg-error" style={{ width: pctWidth(half) }} />
        )}
      </div>
      <div aria-hidden className="w-px shrink-0 bg-foreground/50" />
      <div className="flex flex-1 bg-track/60">
        {direction === "up" && (
          <div data-fill className="h-full bg-success" style={{ width: pctWidth(half) }} />
        )}
      </div>
    </div>
  );
}
