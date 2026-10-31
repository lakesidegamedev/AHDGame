import { describe, expect, it } from "vitest";
import type { CommodityPrice } from "@/lib/db/types/commodityPrice";
import { buildNppPriceSignals } from "../priceSignals";
import { ESSENTIAL_SHORTAGE_SCORE } from "../marketSignals";
import {
  STATE_SHORTFALL_SCORE_CAP,
  shortfallAwareStateRatio,
  stateShortfallScore,
} from "./stateShortfallSignal";

describe("stateShortfallScore", () => {
  it("reads demand over supply, capped", () => {
    expect(stateShortfallScore(100, 100)).toBe(1);
    expect(stateShortfallScore(50, 100)).toBe(2);
    expect(stateShortfallScore(9, 100)).toBe(STATE_SHORTFALL_SCORE_CAP);
    expect(stateShortfallScore(0, 100)).toBe(STATE_SHORTFALL_SCORE_CAP);
    expect(stateShortfallScore(200, 100)).toBe(0.5);
  });

  it("is null without a positive demand or a supply reading", () => {
    expect(stateShortfallScore(10, 0)).toBeNull();
    expect(stateShortfallScore(undefined, 100)).toBeNull();
    expect(stateShortfallScore(10, Number.NaN)).toBeNull();
  });
});

describe("shortfallAwareStateRatio", () => {
  it("raises freight to the shortfall, never lowers it", () => {
    expect(
      shortfallAwareStateRatio({ commodity: "freight", priceRatio: 1.07, supply: 9, demand: 100 })
    ).toBe(STATE_SHORTFALL_SCORE_CAP);
    expect(
      shortfallAwareStateRatio({ commodity: "freight", priceRatio: 1.3, supply: 500, demand: 100 })
    ).toBe(1.3);
  });

  it("leaves other commodities on price", () => {
    expect(
      shortfallAwareStateRatio({ commodity: "steel", priceRatio: 1.07, supply: 9, demand: 100 })
    ).toBe(1.07);
  });
});

describe("NPP state price signal for freight", () => {
  const doc = {
    commodity: "freight",
    basePrice: 10,
    globalPrice: 10.7,
    statePrices: { TX: 10.7, IL: 10.7 },
    stateSupply: { TX: 9, IL: 300 },
    stateDemand: { TX: 100, IL: 100 },
  } as unknown as CommodityPrice;
  const { statePriceRatioOf } = buildNppPriceSignals(new Map([["freight", doc]]));

  it("flags a starved state as critical though its price looks calm", () => {
    expect(statePriceRatioOf("freight", "TX")).toBeGreaterThanOrEqual(ESSENTIAL_SHORTAGE_SCORE);
  });

  it("keeps a surplus state on its price", () => {
    expect(statePriceRatioOf("freight", "IL")).toBeCloseTo(1.07, 9);
  });
});
