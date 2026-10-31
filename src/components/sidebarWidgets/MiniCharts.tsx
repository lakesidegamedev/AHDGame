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
      className={`shrink-0 overflow-visible ${colorClass ?? TONE_CLASS[toneOf(values)]} ${className}`}
    >
      {area && <path d={fill} fill="currentColor" opacity={0.16} />}
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={2} fill="currentColor" />
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
