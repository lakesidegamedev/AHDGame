import { describe, expect, it } from "vitest";
import type { CommodityPrice } from "@/lib/db/types/commodityPrice";
import { buildNppPriceSignals } from "./priceSignals";

const doc = (extra: Partial<CommodityPrice> = {}): CommodityPrice =>
  ({
    commodity: "food",
    basePrice: 100,
    globalPrice: 120,
    globalSupply: 1_000,
    globalDemand: 1_500,
    nationalPrices: { US: 130 },
    nationalSupply: { US: 400 },
    nationalDemand: { US: 600 },
    statePrices: { CA: 140 },
    stateSupply: { CA: 100 },
    stateDemand: { CA: 150 },
    ...extra,
  }) as CommodityPrice;

describe("buildNppPriceSignals", () => {
  it("reads stored prices only, ignoring cap-removed demand", () => {
    const plain = buildNppPriceSignals(new Map([["food", doc()]]));
    const truncated = buildNppPriceSignals(
      new Map([["food", doc({ demandTruncatedUnits: 8_000_000 })]])
    );
    expect(plain.priceRatioOf("food", "US")).toBeCloseTo(1.3, 9);
    expect(truncated.priceRatioOf("food", "US")).toBe(plain.priceRatioOf("food", "US"));
    expect(truncated.statePriceRatioOf("food", "CA")).toBe(plain.statePriceRatioOf("food", "CA"));
  });
});
