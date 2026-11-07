/**
 * National index for a background country (#5702).
 *
 * A background country has no listed corporations, so players take an equity
 * view through one index per country that tracks its aggregate output and the
 * profits on it. The level moves each kernel tick with:
 * - real output since the last tick (trend growth, shocks, export demand);
 * - an earnings yield, reinvested, scaled by the country's stability;
 * - export conditions: a country whose exports sell out earns a little more,
 *   one whose exports go unsold a little less.
 *
 * The index is held through an ordinary index fund whose only asset is cash
 * kept equal to its net asset value. When the level moves, the fund is marked
 * to it: the difference is created or withdrawn against the background
 * economy, the same counterparty its funded-market trade settles against.
 *
 * Pure: plain data in, plain data out.
 */
import { INDEX_FUND_INITIAL_NAV } from "@/lib/indexFunds/unitAccounting";

/** Annual earnings yield, reinvested, at full stability. */
export const NATIONAL_INDEX_EARNINGS_YIELD = 0.03;
/** Level change per unit of export fill away from steady (0.95), per tick. */
export const NATIONAL_INDEX_TRADE_RESPONSE = 0.05;
/** Largest per-tick move from export conditions. */
export const NATIONAL_INDEX_MAX_TRADE_MOVE = 0.01;
/** Largest per-tick move from output, either way. */
export const NATIONAL_INDEX_MAX_OUTPUT_MOVE = 0.15;
/** The level never falls below this. */
export const NATIONAL_INDEX_MIN_LEVEL = 0.05;
/** Export fill at which the trade factor is neutral. */
const STEADY_EXPORT_FILL = 0.95;

export interface NationalIndexState {
  /** 1 at launch; the fund's NAV is the initial NAV times the level. */
  level: number;
  /** Aggregate output at the last mark. */
  output: number;
  turn: number;
}

const finite = (value: number | null | undefined, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));

export function initialNationalIndex(output: number, turn: number): NationalIndexState {
  return { level: 1, output: Math.max(0, finite(output)), turn };
}

/** The index after one kernel tick. */
export function advanceNationalIndex(
  state: NationalIndexState,
  input: {
    output: number;
    turn: number;
    turnsPerYear: number;
    stability: number;
    /** Lagged export fill from the funded market, or null when it does not trade there. */
    exportFill: number | null;
  }
): NationalIndexState {
  const elapsed = input.turn - state.turn;
  if (!(elapsed > 0)) return state;
  const outputFactor =
    state.output > 0 && input.output > 0
      ? clamp(
          input.output / state.output,
          1 - NATIONAL_INDEX_MAX_OUTPUT_MOVE,
          1 + NATIONAL_INDEX_MAX_OUTPUT_MOVE
        )
      : 1;
  const yieldFactor =
    (1 + NATIONAL_INDEX_EARNINGS_YIELD * clamp(finite(input.stability, 0.5), 0, 1)) **
    (elapsed / Math.max(1, input.turnsPerYear));
  const tradeFactor =
    input.exportFill === null
      ? 1
      : 1 +
        clamp(
          NATIONAL_INDEX_TRADE_RESPONSE *
            (finite(input.exportFill, STEADY_EXPORT_FILL) - STEADY_EXPORT_FILL),
          -NATIONAL_INDEX_MAX_TRADE_MOVE,
          NATIONAL_INDEX_MAX_TRADE_MOVE
        );
  return {
    level: Math.max(
      NATIONAL_INDEX_MIN_LEVEL,
      state.level * outputFactor * yieldFactor * tradeFactor
    ),
    output: Math.max(0, finite(input.output)),
    turn: input.turn,
  };
}

/** The fund's NAV at an index level. */
export function nationalIndexNav(level: number): number {
  return INDEX_FUND_INITIAL_NAV * Math.max(NATIONAL_INDEX_MIN_LEVEL, finite(level, 1));
}

/**
 * Mark a national index fund to a new NAV. Every unit (including units queued
 * for redemption) gains or loses the NAV change; cash never goes negative.
 * Returns the cash change, positive when money is created.
 */
export function markNationalIndexFund(input: {
  quotedNav: number;
  newNav: number;
  unitSupply: number;
  queuedUnits: number;
  cashAnchor: number;
}): { cashDelta: number; cashAnchor: number } {
  const units = Math.max(0, finite(input.unitSupply)) + Math.max(0, finite(input.queuedUnits));
  const cash = Math.max(0, finite(input.cashAnchor));
  const raw = (finite(input.newNav) - finite(input.quotedNav)) * units;
  const cashDelta = Math.max(-cash, raw);
  return { cashDelta, cashAnchor: cash + cashDelta };
}

/** Slug, name and ticker for a background country's national index fund. */
export function nationalIndexFundIdentity(
  countryId: string,
  displayName: string
): { slug: string; name: string; tickerSymbol: string } {
  return {
    slug: `${countryId.toLowerCase()}_national`,
    name: `${displayName} National Index`,
    tickerSymbol: `${countryId.toUpperCase()}NX`,
  };
}
