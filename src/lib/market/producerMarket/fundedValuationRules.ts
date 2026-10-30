/**
 * Funded producer path: what a sector is worth to its shareholders
 * (gameConfig.fundedValuationStage >= 1).
 *
 * On a funded turn the settlement decides what a plant sold and earned. The
 * legacy per-sector pass still runs beside it and prices the plant's nameplate
 * at current market prices, so a plant that sold nothing while its goods were
 * short still carried a rising going-concern value, and that value became the
 * share price. Here a funded sector is worth the larger of:
 * - the capitalized value of what it actually earned this turn, after every
 *   cost the sector carries, and
 * - the paid basis of the capacity it owns, which never moves with prices.
 *
 * Growth for the share price premium is read from real output: units sold,
 * valued at the sector's fixed base mix price. A price climb on the same sales
 * is not growth.
 *
 * Pure: plain data in, plain data out.
 */

export interface FundedSectorValueInput {
  /** Anchor per turn: settled revenue less every cost the sector carries this turn. */
  profitPerTurn: number;
  /** Anchor: paid basis of the owned capacity, already depreciated. */
  bookFloorAnchor: number;
  turnsPerYear: number;
  /** Annual rate the earnings stream is capitalized at. */
  annualDiscountRate: number;
  /** Phased stock-market boost on the earnings value only, never on the book floor. */
  npvBoostMultiplier?: number;
}

/** Anchor value of one funded sector for the share price and credit rating. */
export function fundedSectorValueAnchor(input: FundedSectorValueInput): number {
  const yearlyProfit = finite(input.profitPerTurn) * Math.max(0, finite(input.turnsPerYear));
  const rate = finite(input.annualDiscountRate);
  const boost = finite(input.npvBoostMultiplier ?? 1);
  const earningsValue =
    yearlyProfit > 0 && rate > 0 ? (yearlyProfit / rate) * (boost > 0 ? boost : 1) : 0;
  const book = Math.max(0, finite(input.bookFloorAnchor));
  return Math.round(Math.max(earningsValue, book));
}

/**
 * Real output of one funded sector this turn: units sold at its fixed base mix
 * price. Only ratios of this figure over time are read, so its scale need only
 * be stable per sector.
 */
export function fundedRealOutputAnchor(soldUnits: number, baseMixPriceAnchor: number): number {
  const units = Math.max(0, finite(soldUnits));
  const price = Math.max(0, finite(baseMixPriceAnchor));
  return units * price;
}

function finite(x: number): number {
  return Number.isFinite(x) ? x : 0;
}
