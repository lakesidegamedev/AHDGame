import type { CommodityType } from "@/lib/constants/commodities";
import type { CommodityPrice } from "@/lib/db/types/commodityPrice";
import { latentAwareNationalRatio, latentAwareStateRatio } from "@/lib/market/latentShortageSignal";
import type { CommodityPriceRatioFn } from "./marketSignals";
import { shortfallAwareStateRatio } from "./rules/stateShortfallSignal";

export function buildNppPriceSignals(priceByCommodity: ReadonlyMap<string, CommodityPrice>): {
  priceRatioOf: CommodityPriceRatioFn;
  stateDemandOf: (commodity: CommodityType, stateId: string) => number | null;
  statePriceRatioOf: (commodity: CommodityType, stateId: string) => number | null;
  stateInputAvailabilityOf: (commodity: CommodityType, stateId: string) => number | null;
} {
  const priceRatioOf: CommodityPriceRatioFn = (commodity, countryId) => {
    const doc = priceByCommodity.get(commodity);
    if (!doc || !doc.basePrice) return null;
    // Prefer the reachable-market price: the NPP brain should chase the market
    // its sectors actually clear in, not the planet-wide aggregate.
    const price =
      doc.reachablePrices?.[countryId] ?? doc.nationalPrices?.[countryId] ?? doc.globalPrice;
    if (!price || !Number.isFinite(price)) return null;
    const stored = price / doc.basePrice;
    return latentAwareNationalRatio(doc, countryId, stored) ?? stored;
  };

  const statePriceRatioOf = (commodity: CommodityType, stateId: string): number | null => {
    const doc = priceByCommodity.get(commodity);
    if (!doc || !doc.basePrice) return null;
    const price = doc.statePrices?.[stateId];
    if (price == null || !Number.isFinite(price)) return null;
    const stored = price / doc.basePrice;
    // Freight cannot be shipped in from a neighbor, so its state shortfall
    // counts even when the blended state price looks calm.
    return shortfallAwareStateRatio({
      commodity,
      priceRatio: latentAwareStateRatio(doc, stateId, stored) ?? stored,
      supply: doc.stateSupply?.[stateId],
      demand: doc.stateDemand?.[stateId],
    });
  };

  const stateDemandOf = (commodity: CommodityType, stateId: string): number | null => {
    const value = priceByCommodity.get(commodity)?.stateDemand?.[stateId];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  // Delivered share of each state's input demand from the prior freight
  // settlement: the fill the corporation turn throttles plants against.
  const stateInputAvailabilityOf = (commodity: CommodityType, stateId: string): number | null => {
    const value = priceByCommodity.get(commodity)?.stateInputAvailability?.[stateId];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  return { priceRatioOf, statePriceRatioOf, stateDemandOf, stateInputAvailabilityOf };
}
