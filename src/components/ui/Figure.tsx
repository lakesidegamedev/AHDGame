import type { ReactNode } from "react";
import {
  formatCount,
  formatCountDelta,
  formatMoney,
  formatMoneyDelta,
  formatPercent,
  formatPercentDelta,
  formatPercentagePoints,
  formatShares,
  formatTurns,
  type MoneyOptions,
} from "@/lib/ui/numbers";
import { toneForDelta, toneText, type Tone } from "@/lib/ui/tone";

export type FigureKind = "money" | "percent" | "count" | "shares" | "turns";
export type DeltaKind = "money" | "percent" | "points" | "count";

interface FigureProps extends MoneyOptions {
  value: number | null | undefined;
  kind: FigureKind;
  /** Tone override. Plain figures are neutral by default. */
  tone?: Tone;
  /** Overrides money formatting, e.g. the currency context's converter. */
  formatMoneyValue?: (amount: number) => string;
  digits?: number;
  className?: string;
}

function formatFigure(p: FigureProps, value: number): string {
  switch (p.kind) {
    case "money":
      return p.formatMoneyValue ? p.formatMoneyValue(value) : formatMoney(value, p);
    case "percent":
      return formatPercent(value, p.digits);
    case "count":
      return formatCount(value, p.compact);
    case "shares":
      return formatShares(value, p.compact);
    case "turns":
      return formatTurns(value);
  }
}

/** A plain quantity: tabular digits, neutral unless told otherwise. */
export function Figure(props: FigureProps): ReactNode {
  const { value, tone = "neutral", className = "" } = props;
  const text = typeof value === "number" ? formatFigure(props, value) : "—";
  return <span className={`tabular-nums ${toneText(tone)} ${className}`.trim()}>{text}</span>;
}

interface DeltaProps extends MoneyOptions {
  value: number | null | undefined;
  kind: DeltaKind;
  /** True when a rise is bad, e.g. a cost. */
  invert?: boolean;
  formatMoneyValue?: (amount: number) => string;
  digits?: number;
  className?: string;
}

function formatDeltaValue(p: DeltaProps, value: number): string {
  switch (p.kind) {
    case "money": {
      if (!p.formatMoneyValue) return formatMoneyDelta(value, p);
      const body = p.formatMoneyValue(Math.abs(value));
      return value === 0 ? body : `${value > 0 ? "+" : "-"}${body}`;
    }
    case "percent":
      return formatPercentDelta(value, p.digits);
    case "points":
      return formatPercentagePoints(value, p.digits);
    case "count":
      return formatCountDelta(value, p.compact);
  }
}

/** A change: always signed, green for gain, red for loss, neutral at zero. */
export function Delta(props: DeltaProps): ReactNode {
  const { value, invert, className = "" } = props;
  const usable = typeof value === "number" && Number.isFinite(value);
  const text = usable ? formatDeltaValue(props, value) : "—";
  const tone = toneForDelta(usable ? value : null, invert);
  return <span className={`tabular-nums ${toneText(tone)} ${className}`.trim()}>{text}</span>;
}
