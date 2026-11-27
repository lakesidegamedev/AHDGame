import type { CommodityPrice } from "@/lib/db/types";
import { commodityPricesCollection } from "@/lib/db/repositories/commodityPrices";
import { commodityPricingOpening } from "./rules/pricingOpening";
import type { CollectionSource } from "@/lib/db/repositories/source";

/**
 * Last turn's stored price fields the next settlement reads back. A field the
 * pricing pass reads from `existing` but this projection drops arrives as
 * undefined, which silently switches off whatever paces against it.
 */
export const PREVIOUS_COMMODITY_PRICE_PROJECTION = {
  commodity: 1,
  turn: 1,
  pricingOpening: 1,
  nudgePrice: 1,
  nudgeTurn: 1,
  globalPrice: 1,
  statePrices: 1,
  // Sourcing quotes these as each foreign seller's ask.
  nationalPrices: 1,
  // Each country's reachable price is paced against its value last turn.
  reachablePrices: 1,
  hardPeg: 1,
  stateHardPegs: 1,
  stateNudges: 1,
  scarcityMult: 1,
  scarcityMultByCountry: 1,
  // Momentum-mode ratchet (commodityFixStage >= 1) reads its
  // trailing imbalance window back from the previous turn.
  scarcityImbalanceHistory: 1,
  scarcityImbalanceHistoryByCountry: 1,
  buildDemandCapGap: 1,
  // Plants household re-anchor: prior global supply for the
  // PLANTS_HOUSEHOLD_SUPPLY_CAP clamp.
  globalSupply: 1,
} as const satisfies Partial<Record<keyof CommodityPrice, 1>>;

/** Existing commodity prices: drift baseline, pace reference and peg state. */
export async function readPreviousCommodityPrices(
  db: CollectionSource,
  turn?: number
): Promise<CommodityPrice[]> {
  const prices = await commodityPricesCollection(db)
    .find({}, { projection: PREVIOUS_COMMODITY_PRICE_PROJECTION })
    .toArray();
  return turn === undefined
    ? prices
    : prices.flatMap((price) => {
        const opening = commodityPricingOpening(price, turn);
        return opening ? [opening] : [];
      });
}
