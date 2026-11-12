import { TURNS_PER_DAY, GROWTH_RATE_TURNS_PER_YEAR } from "@/lib/constants/corporationsClient";

/**
 * The one place that converts a stored money figure into a display period.
 *
 * Every persisted money figure (sector revenue, realized revenue, maintenance,
 * wages, growth cost, profit, corp income) is a **daily** rate on the 24-turn
 * financial day. `daily` is canonical because it is the storage basis; `turn`
 * and `annual` are views on it.
 *
 * The annual factor is 2, not 365: a game year is GROWTH_RATE_TURNS_PER_YEAR
 * (48) turns and a financial day is TURNS_PER_DAY (24), so one year is two
 * financial days. Deriving it from both constants stays correct if a clock
 * moves.
 */
export type MoneyPeriod = "turn" | "daily" | "annual";

export const MONEY_PERIODS: readonly MoneyPeriod[] = ["turn", "daily", "annual"] as const;

/** Multiply a stored (daily) figure by this to display it in the given period. */
export const MONEY_PERIOD_FACTOR: Record<MoneyPeriod, number> = {
  turn: 1 / TURNS_PER_DAY,
  daily: 1,
  annual: GROWTH_RATE_TURNS_PER_YEAR / TURNS_PER_DAY,
};

/** Suffix appended to a formatted amount, e.g. "$1.2M/turn". */
export const MONEY_PERIOD_SUFFIX: Record<MoneyPeriod, string> = {
  turn: "/turn",
  daily: "/day",
  annual: "/yr",
};

/** Human label for headers and toggles. */
export const MONEY_PERIOD_LABEL: Record<MoneyPeriod, string> = {
  turn: "Per turn",
  daily: "Daily",
  annual: "Annual",
};

/** Short toggle-button text. */
export const MONEY_PERIOD_SHORT: Record<MoneyPeriod, string> = {
  turn: "Turn",
  daily: "Day",
  annual: "Year",
};

/** Prose form for sentences, e.g. "budget per turn". */
export const MONEY_PERIOD_PER_LABEL: Record<MoneyPeriod, string> = {
  turn: "per turn",
  daily: "per day",
  annual: "per year",
};

/**
 * Explains why a game year is only 2× a day. Shown wherever the period toggle
 * appears, because "annual revenue is twice daily revenue" reads as a bug
 * without it.
 */
export const MONEY_PERIOD_HELP =
  `One turn is one hour. ${TURNS_PER_DAY} turns is one financial day, and ` +
  `${GROWTH_RATE_TURNS_PER_YEAR} turns is one game year. A game year is therefore ` +
  `two financial days, so annual figures are 2× daily figures, not 365×.`;

export function scaleMoney(dailyValue: number, period: MoneyPeriod): number {
  return dailyValue * MONEY_PERIOD_FACTOR[period];
}

/**
 * Inverse of {@link scaleMoney}: turn a figure the player typed or dragged in
 * the displayed period back into the daily rate the API and DB expect.
 */
export function unscaleMoney(displayValue: number, period: MoneyPeriod): number {
  return displayValue / MONEY_PERIOD_FACTOR[period];
}
