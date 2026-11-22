/**
 * One formatter per quantity kind, built on the shared formatters so rounding
 * rules live in one place. Deltas always carry a sign; zero carries none.
 */
import {
  formatCompactNumber,
  formatCurrencyFull,
  formatFundsCompact,
  formatSharePrice,
} from "@/lib/utils/formattersCore";

export const MINUS = "-";
const PLACEHOLDER = "—";

function signOf(value: number, rounded: number): "+" | "-" | "" {
  if (rounded === 0 || value === 0) return "";
  return value > 0 ? "+" : MINUS;
}

function grouped(value: number, minDigits: number, maxDigits: number): string {
  return Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  });
}

/** Round to the display precision so a sign never sits on a displayed zero. */
function roundTo(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(Math.abs(value) * f) / f;
}

export interface MoneyOptions {
  /** Currency symbol, from the viewer's currency context. */
  symbol?: string;
  /** K/M/B suffixes for dense tables. */
  compact?: boolean;
  /** Show cents. Use wherever the figure must reconcile with another. */
  cents?: boolean;
}

function moneyMagnitude(abs: number, o: MoneyOptions): string {
  const symbol = o.symbol ?? "$";
  if (o.compact) return formatFundsCompact(abs, symbol);
  if (o.cents) return formatSharePrice(abs, symbol);
  return formatCurrencyFull(abs, symbol);
}

export function formatMoney(amount: number, o: MoneyOptions = {}): string {
  if (!Number.isFinite(amount)) return `${o.symbol ?? "$"}${PLACEHOLDER}`;
  const shown = roundTo(amount, o.cents ? 2 : 0);
  return `${amount < 0 && shown !== 0 ? MINUS : ""}${moneyMagnitude(Math.abs(amount), o)}`;
}

export function formatMoneyDelta(amount: number, o: MoneyOptions = {}): string {
  if (!Number.isFinite(amount)) return PLACEHOLDER;
  const shown = roundTo(amount, o.cents ? 2 : 0);
  return `${signOf(amount, shown)}${moneyMagnitude(Math.abs(amount), o)}`;
}

/** Value is already in percent units (12.5 means 12.5%). */
export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return PLACEHOLDER;
  const shown = roundTo(value, digits);
  return `${value < 0 && shown !== 0 ? MINUS : ""}${grouped(value, digits, digits)}%`;
}

export function formatPercentDelta(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return PLACEHOLDER;
  const shown = roundTo(value, digits);
  return `${signOf(value, shown)}${grouped(value, digits, digits)}%`;
}

/** Difference between two percentages, never "%". */
export function formatPercentagePoints(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return PLACEHOLDER;
  const shown = roundTo(value, digits);
  return `${signOf(value, shown)}${grouped(value, digits, digits)} pp`;
}

export function formatCount(value: number, compact = false): string {
  if (!Number.isFinite(value)) return PLACEHOLDER;
  if (compact) return formatCompactNumber(value);
  const shown = roundTo(value, 0);
  return `${value < 0 && shown !== 0 ? MINUS : ""}${grouped(value, 0, 0)}`;
}

export function formatCountDelta(value: number, compact = false): string {
  if (!Number.isFinite(value)) return PLACEHOLDER;
  const shown = roundTo(value, 0);
  const body = compact ? formatCompactNumber(Math.abs(value)) : grouped(value, 0, 0);
  return `${signOf(value, shown)}${body}`;
}

/** Whole shares group normally; fractions show up to two places. */
export function formatShares(value: number, compact = false): string {
  if (!Number.isFinite(value)) return PLACEHOLDER;
  if (compact) return formatCompactNumber(value);
  const whole = Number.isInteger(value);
  const shown = roundTo(value, whole ? 0 : 2);
  return `${value < 0 && shown !== 0 ? MINUS : ""}${grouped(value, 0, whole ? 0 : 2)}`;
}

/** A signed amount per turn, with the amount already formatted by the caller. */
export function formatPerTurn(formattedAmount: string): string {
  return `${formattedAmount}/turn`;
}

export function formatTurns(count: number): string {
  if (!Number.isFinite(count)) return PLACEHOLDER;
  const n = Math.round(count);
  return `${grouped(n, 0, 0)} ${n === 1 ? "turn" : "turns"}`;
}

/** A unitless score such as an appeal rating. */
export function formatScore(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return PLACEHOLDER;
  const shown = roundTo(value, digits);
  return `${value < 0 && shown !== 0 ? MINUS : ""}${grouped(value, digits, digits)}`;
}
