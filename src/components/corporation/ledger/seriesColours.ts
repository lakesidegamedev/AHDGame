/**
 * Theme-token colours for chart series on the corporation page. Class names are
 * spelled out in full so Tailwind can see them.
 */
export type SeriesTone = "info" | "gold" | "primary" | "success" | "error" | "muted";

export const SERIES_ORDER: SeriesTone[] = ["info", "gold", "primary", "success", "error", "muted"];

const BG: Record<SeriesTone, string> = {
  info: "bg-info",
  gold: "bg-gold",
  primary: "bg-primary",
  success: "bg-success",
  error: "bg-error",
  muted: "bg-muted",
};

const STROKE: Record<SeriesTone, string> = {
  info: "stroke-info",
  gold: "stroke-gold",
  primary: "stroke-primary",
  success: "stroke-success",
  error: "stroke-error",
  muted: "stroke-muted",
};

export function seriesBg(tone: SeriesTone): string {
  return BG[tone];
}

export function seriesStroke(tone: SeriesTone): string {
  return STROKE[tone];
}

/**
 * One slice of a stacked bar or ring. `color` is a CSS colour that comes from
 * data (a corporation's brand shades) and wins over `tone` when present.
 */
export interface LedgerSegment {
  key: string;
  label: string;
  value: number;
  display: string;
  tone?: SeriesTone;
  color?: string;
  href?: string | null;
  isYou?: boolean;
}

export function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}

/** Percent with at most one decimal, without a trailing ".0". */
export function pctWidth(pct: number): string {
  return `${Number(clampPct(pct).toFixed(1))}%`;
}

/** Sum of the positive values; non-finite and negative values count as zero. */
export function positiveTotal(values: number[]): number {
  return values.reduce((sum, v) => sum + (Number.isFinite(v) && v > 0 ? v : 0), 0);
}
