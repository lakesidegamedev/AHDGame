import type { CommodityPrice } from "@/lib/db/types";

/** A committed current-turn quote must not become its own drift baseline. */
export function commodityPricingOpening(
  price: CommodityPrice | undefined,
  turn: number
): CommodityPrice | undefined {
  if (price?.turn === turn && price.pricingOpening !== undefined)
    return price.pricingOpening ?? undefined;
  return price;
}

export function freezeCommodityPricingOpening(
  price: CommodityPrice | undefined
): Omit<CommodityPrice, "pricingOpening"> | null {
  if (!price) return null;
  const { pricingOpening: _opening, ...snapshot } = price;
  return snapshot;
}
