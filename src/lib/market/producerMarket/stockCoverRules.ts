/**
 * Seller-side markdown on stock that does not move (gameConfig.producerStockCover).
 *
 * A producer's unsold output is carried and re-offered every turn. With no cost
 * to carry it and an ask set from its own cost, dead stock sits above every
 * buyer's ceiling forever: on c23 one Japanese food plant held 367,001 units
 * asking 340.6 against household ceilings of 320 (JP) and 265 (US), and steel
 * stock grew from 193k to 462k in 11 turns with spoilage near 0.2% a turn.
 *
 * Stock cover is carried stock divided by last turn's sales, in turns. Above
 * `coverTurns` the ask falls with cover, down to a floor, and a small share of
 * the stock beyond the cover is written down each turn. Real sellers clear a
 * glut by cutting the price; this does the same and keeps the memory (the stock
 * and the build queue persist; only the ask and the excess shrink).
 *
 * Pure: stock, recent sales and the policy in, a price factor and write-down out.
 */

export interface StockCoverPolicy {
  /** Turns of recent sales a seller may carry before it marks down; 0 or absent = off. */
  coverTurns: number;
}

/** Ask never falls below this share of what the cover rule alone would allow. */
export const MARKDOWN_MIN_FACTOR = 0.5;
/** Rate at which stock beyond the cover is written down each turn. */
const WRITE_DOWN_RATE = 0.02;
/** Markdown never takes an ask below this share of the reference price (the existing market floor). */
const MARKDOWN_REFERENCE_FLOOR = 0.6;
const EXPONENT = 0.5;

/** Turns of recent sales the stock represents; infinity when nothing sold. */
export function stockCover(stockUnits: number, recentSoldUnits: number): number {
  if (!(stockUnits > 0)) return 0;
  return recentSoldUnits > 0 ? stockUnits / recentSoldUnits : Number.POSITIVE_INFINITY;
}

/** Multiplier on the ask: 1 within the cover, then (cover/N)^-0.5, never under MARKDOWN_MIN_FACTOR. */
export function markdownFactor(cover: number, policy: StockCoverPolicy): number {
  const n = policy.coverTurns;
  if (!(n > 0) || !(cover > n)) return 1;
  if (!Number.isFinite(cover)) return MARKDOWN_MIN_FACTOR;
  return Math.max(MARKDOWN_MIN_FACTOR, Math.pow(n / cover, EXPONENT));
}

/** The ask after markdown, held at or above the reference floor unless it already was below it. */
export function markedDownAsk(ask: number, reference: number, factor: number): number {
  if (!(factor < 1)) return ask;
  const floor = reference * MARKDOWN_REFERENCE_FLOOR;
  return Math.max(ask * factor, Math.min(ask, floor));
}

/** Units of unsold stock written down this turn: a small share of what is beyond the cover. */
export function writeDownUnits(
  stockUnits: number,
  cover: number,
  policy: StockCoverPolicy
): number {
  const n = policy.coverTurns;
  if (!(n > 0) || !(stockUnits > 0) || !(cover > n)) return 0;
  const excess = Number.isFinite(cover) ? 1 - n / cover : 1;
  return stockUnits * WRITE_DOWN_RATE * excess;
}

/**
 * Stock carried into the next turn is valued at cost, but the cost of a run
 * that made almost nothing is a loss of the period, not an asset: labour and
 * site bills divided by a near-zero output would value a few units of stock
 * at billions, and the stock-cover write-down would then book that as a real
 * loss (a Finnish timber plant on the fresh-economy proof wrote off 31 billion
 * anchor on five millionths of a unit). The unit cost basis is capped at a
 * multiple of the reference price; whatever is above it was already expensed.
 */
export const MAX_STOCK_COST_MULTIPLE = 3;
export function cappedStockUnitCost(unitCost: number, referenceUnitPrice: number): number {
  if (!(Number.isFinite(unitCost) && unitCost > 0)) return 0;
  if (!(Number.isFinite(referenceUnitPrice) && referenceUnitPrice > 0)) return unitCost;
  return Math.min(unitCost, MAX_STOCK_COST_MULTIPLE * referenceUnitPrice);
}
