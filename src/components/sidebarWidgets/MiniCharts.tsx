"use client";

/**
 * Small inline SVG charts for sidebar widgets. Colours come from theme
 * variables through `currentColor`, so every theme recolours them. Each mark
 * carries a native tooltip and the chart an accessible summary.
 */

export type Tone = "up" | "down" | "flat";

export function toneOf(values: number[]): Tone {
  if (values.length < 2) return "flat";
  const first = values[0]!;
  const last = values[values.length - 1]!;
  return last > first ? "up" : last < first ? "down" : "flat";
}

export const TONE_CLASS: Record<Tone, string> = {
  up: "text-success",
  down: "text-error",
  flat: "text-muted",
};

interface TrendProps {
  values: number[];
  /** Accessible summary of the whole chart. */
  label: string;
  width?: number;
  height?: number;
  /** Fill under the line. */
  area?: boolean;
  /** Text colour class for the line; defaults to the trend's direction. */
  colorClass?: string;
  /**
   * Colour only the latest point, by the latest move; the line stays neutral.
   * Use when a change figure sits beside the chart, so the line's own
   * direction over the window never contradicts it.
   */
  endTone?: Tone;
  /** Tooltip text for one point. */
  format?: (value: number, index: number) => string;
  className?: string;
}

/** A line, optionally filled, with a dot on the latest value. */
export function TrendSparkline({
  values,
  label,
  width = 64,
  height = 20,
  area = false,
  colorClass,
  endTone,
  format,
  className = "",
}: TrendProps) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const step = w / (values.length - 1);
  const xs = values.map((_, i) => pad + i * step);
  const ys = values.map((v) => pad + h - ((v - min) / range) * h);
  const line = xs.map((x, i) => `${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(" ");
  const fill = `M${xs[0]!.toFixed(1)},${(pad + h).toFixed(1)} L${line.replaceAll(" ", " L")} L${xs[xs.length - 1]!.toFixed(1)},${(pad + h).toFixed(1)} Z`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className={`shrink-0 overflow-visible ${endTone ? "text-muted" : (colorClass ?? TONE_CLASS[toneOf(values)])} ${className}`}
    >
      {(area || endTone) && <path d={fill} fill="currentColor" opacity={endTone ? 0.1 : 0.16} />}
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* A ring in the card colour keeps the end dot legible where it sits on the line. */}
      <circle
        cx={xs[xs.length - 1]}
        cy={ys[ys.length - 1]}
        r={endTone ? 2.75 : 2}
        fill="currentColor"
        stroke={endTone ? "var(--card)" : "none"}
        strokeWidth={endTone ? 1.5 : 0}
        className={endTone ? TONE_CLASS[endTone] : undefined}
      />
      {format &&
        values.map((value, i) => (
          <rect key={i} x={xs[i]! - step / 2} y={0} width={step} height={height} fill="transparent">
            <title>{format(value, i)}</title>
          </rect>
        ))}
    </svg>
  );
}

interface BarStripProps {
  values: number[];
  label: string;
  width?: number;
  height?: number;
  format?: (value: number, index: number) => string;
}

/** One bar per turn from a zero line: gains up in green, losses down in red. */
export function BarStrip({ values, label, width = 120, height = 24, format }: BarStripProps) {
  if (values.length === 0) return null;
  const top = Math.max(0, ...values);
  const bottom = Math.min(0, ...values);
  const span = top - bottom || 1;
  const zero = (top / span) * height;
  const gap = 2;
  const barWidth = Math.max(2, (width - gap * (values.length - 1)) / values.length);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className="shrink-0 overflow-visible"
    >
      <line x1={0} x2={width} y1={zero} y2={zero} stroke="currentColor" opacity={0.25} />
      {values.map((value, i) => {
        const size = Math.max(value === 0 ? 0 : 1, (Math.abs(value) / span) * height);
        return (
          <rect
            key={i}
            x={i * (barWidth + gap)}
            y={value >= 0 ? zero - size : zero}
            width={barWidth}
            height={size}
            rx={1}
            className={value >= 0 ? "text-success" : "text-error"}
            fill="currentColor"
          >
            {format && <title>{format(value, i)}</title>}
          </rect>
        );
      })}
    </svg>
  );
}

/**
 * Tile fill for a percent change: the card colour at zero, mixing towards
 * the theme's gain or loss colour as the move grows, full strength at 5%.
 */
export function heatColor(change: number): string {
  const strength = Math.min(1, Math.abs(change) / 5);
  if (strength < 0.04) return "var(--card-muted, var(--card))";
  const pole = change > 0 ? "var(--success)" : "var(--error)";
  return `color-mix(in oklab, ${pole} ${Math.round(12 + strength * 38)}%, var(--card-muted, var(--card)))`;
}

/** The latest move as a tone, for an end dot that agrees with the change figure. */
export function toneOfChange(change: number | null): Tone {
  if (change === null || change === 0) return "flat";
  return change > 0 ? "up" : "down";
}

interface MeterProps {
  /** 0 to 100. */
  value: number;
  label: string;
  /** Draw a tick at this mark, e.g. 50 for a majority. */
  mark?: number;
  /** Fill class; one hue for magnitude. */
  fillClass?: string;
}

/** A thin 0 to 100 bar for shares and ratings. */
export function Meter({ value, label, mark, fillClass = "bg-secondary" }: MeterProps) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <span
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width * 10) / 10}
      title={label}
      className="relative block h-1.5 w-full overflow-hidden rounded-full bg-card-border/60"
    >
      <span
        className={`absolute inset-y-0 left-0 rounded-full ${fillClass}`}
        style={{ width: `${width}%` }}
      />
      {mark !== undefined && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-foreground/50"
          style={{ left: `${mark}%` }}
        />
      )}
    </span>
  );
}
