/**
 * Quantity-based shortage signal for goods that cannot be shipped between
 * states. Freight sells only in the state that makes it, and its state price is
 * blended with wider markets, so a state with a tenth of the trucks it needs
 * can still price near the national average. The AI's build signals read this
 * score alongside the price ratio and take whichever says "shorter".
 *
 * Rules only: plain numbers in, a score out.
 */
import type { CommodityType } from "@/lib/constants/commodities";

/** Commodities whose state supply and demand drive the AI shortage signal. */
export const STATE_SHORTFALL_SIGNAL_COMMODITIES: ReadonlySet<CommodityType> = new Set(["freight"]);

/**
 * Ceiling on the shortfall score. A state with no supply at all would
 * otherwise score infinity; 4 already clears every shortage bar the AI uses.
 */
export const STATE_SHORTFALL_SCORE_CAP = 4;

/** True when `commodity` reads the state shortfall signal. */
export function isStateShortfallCommodity(commodity: CommodityType): boolean {
  return STATE_SHORTFALL_SIGNAL_COMMODITIES.has(commodity);
}

/**
 * Demand over supply in one state, capped at {@link STATE_SHORTFALL_SCORE_CAP}.
 * On the same scale as a price ratio: 1 is balanced, 1.6 means supply covers
 * under 63% of demand. Null without a positive demand reading or a usable
 * supply reading.
 */
export function stateShortfallScore(
  supply: number | null | undefined,
  demand: number | null | undefined
): number | null {
  if (typeof demand !== "number" || !Number.isFinite(demand) || !(demand > 0)) return null;
  if (typeof supply !== "number" || !Number.isFinite(supply)) return null;
  const floor = demand / STATE_SHORTFALL_SCORE_CAP;
  return demand / Math.max(supply, floor);
}

/**
 * The shortage ratio the AI should see for `commodity` in one state: the price
 * ratio, raised to the shortfall score when the state is physically shorter
 * than its price says. Never lowered: a surplus state keeps its price signal.
 */
export function shortfallAwareStateRatio(args: {
  commodity: CommodityType;
  priceRatio: number;
  supply: number | null | undefined;
  demand: number | null | undefined;
}): number {
  if (!isStateShortfallCommodity(args.commodity)) return args.priceRatio;
  const shortfall = stateShortfallScore(args.supply, args.demand);
  return shortfall != null && shortfall > args.priceRatio ? shortfall : args.priceRatio;
}
