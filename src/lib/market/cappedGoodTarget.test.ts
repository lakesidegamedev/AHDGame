import { describe, expect, it } from "vitest";
import { cappedGoodNote, cappedGoodTarget } from "./cappedGoodTarget";
import { commodityOverview } from "./overviewPreview";

function good(name: string, applied: number, lag: number, demand = 1.2) {
  const real = 1000;
  return {
    commodity: name,
    label: name,
    basePrice: real,
    globalPrice: applied,
    priceCeiling: applied,
    globalSupply: 100,
    globalDemand: 100 * demand,
    priceAttribution: {
      appliedPrice: applied,
      realBasePrice: real,
      nominalInflation: 0,
      scarcityMemory: 0,
      producerInputCostPassThrough: 0,
      marketBalance: applied - real - lag,
      adjustmentLag: lag,
      explicitOverride: 0,
    },
  };
}

describe("cappedGoodTarget", () => {
  it("returns the held-back target and demand over supply", () => {
    const t = cappedGoodTarget(good("a", 3673, -3827))!;
    expect(t.targetPrice).toBe(7500);
    expect(Math.round(t.targetVsBasePct)).toBe(650);
    expect(t.demandSupplyRatio).toBeCloseTo(1.2);
    expect(cappedGoodNote(t)).toBe(
      "held at the cap; the market price would be about +650% without it (demand is 1.20x supply)"
    );
  });
  it("shows nothing when the parts do not add up", () => {
    const g = good("a", 3673, -3827);
    g.priceAttribution.marketBalance += 500;
    expect(cappedGoodTarget(g)).toBeNull();
  });
  it("shows nothing when nothing is held back or data is missing", () => {
    expect(cappedGoodTarget(good("a", 3673, 0))).toBeNull();
    expect(cappedGoodTarget({ basePrice: 1, globalPrice: 2, priceAttribution: null })).toBeNull();
  });
});

describe("capped goods on the commodities card", () => {
  it("orders goods sharing the cap figure by how far their target sits above it", () => {
    const rows = [good("low", 3673, -500), good("high", 3673, -3827), good("mid", 3673, -2000)];
    const { movers, capped } = commodityOverview(rows);
    expect(capped.map((r) => r.commodity)).toEqual(["high", "mid", "low"]);
    expect(movers).toEqual([]);
  });
});
