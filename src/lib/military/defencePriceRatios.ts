import type { Db } from "mongodb";
import { COMMODITY_BASE_PRICES, type CommodityType } from "@/lib/constants/commodities";
import type { CommodityPrice } from "@/lib/db/types/commodityPrice";

/**
 * Live commodity price ratios for defence lot costing.
 *
 * Shares its source and shape with the corporation turn's `priceRatioByCommodity`
 * (`globalPrice / basePrice`), so a lot's cost floor and a plant's input bill move
 * together. Deliberately the WORLD ratio, not per-country: the award form is a
 * client component that quotes a band before country data is in scope, and both
 * ends of a negotiation need the same number.
 */
export type CommodityPriceRatios = ReadonlyMap<CommodityType, number>;

/** Ratios that leave every recipe at its nominal share, for a world with no price book yet. */
export const NOMINAL_PRICE_RATIOS: CommodityPriceRatios = new Map();

/**
 * Build the ratio map from the live price book.
 *
 * A commodity is skipped rather than defaulted when either side of the ratio is unusable, so a
 * half-seeded book yields a partial map and the missing entries fall back to ratio 1 inside
 * `lotInputCost`. Returning a zero for a missing price would cost the lot at nothing and put
 * the floor on the floor, which is the one failure mode the band exists to prevent.
 */
export function priceRatiosFrom(prices: readonly CommodityPrice[]): CommodityPriceRatios {
  const out = new Map<CommodityType, number>();
  for (const p of prices) {
    const base = COMMODITY_BASE_PRICES[p.commodity];
    if (!(base > 0)) continue;
    if (typeof p.globalPrice !== "number" || !Number.isFinite(p.globalPrice) || p.globalPrice <= 0)
      continue;
    out.set(p.commodity, p.globalPrice / base);
  }
  return out;
}

/**
 * One projected read of the price book, for callers that price a lot.
 *
 * Cheap enough to do per request on the award path and ONCE per delivery sweep. Never cached at
 * module scope: a stale ratio would survive a world reset into the next era, which is exactly
 * the class of bug the anchor-rate module was written to remove.
 */
export async function loadDefencePriceRatios(db: Db): Promise<CommodityPriceRatios> {
  const prices = await db
    .collection<CommodityPrice>("commodityPrices")
    .find({}, { projection: { commodity: 1, globalPrice: 1 } })
    .toArray();
  return priceRatiosFrom(prices);
}
