import { describe, expect, it } from "vitest";
import { planOpeningPriceReset, type OpeningPriceDoc } from "./openingPriceRules";

const BASE = 100;

function apply(doc: OpeningPriceDoc, patch: ReturnType<typeof planOpeningPriceReset>) {
  const next: Record<string, unknown> = { ...doc, ...patch.set };
  for (const key of patch.unset) delete next[key];
  return next as unknown as OpeningPriceDoc;
}

const inflated: OpeningPriceDoc = {
  commodity: "steel",
  globalPrice: 240,
  statePrices: { a: 250, b: 190 },
  nationalPrices: { US: 230, CA: 210 },
  reachablePrices: { US: 220 },
  scarcityMult: 1.8,
  scarcityMultByCountry: { US: 1.6, CA: 0.7 },
  scarcityImbalanceHistory: [0.3, 0.4],
  scarcityImbalanceHistoryByCountry: { US: [0.2] },
};

describe("planOpeningPriceReset", () => {
  it("puts every price leg at nominal base and every multiplier at neutral", () => {
    const next = apply(inflated, planOpeningPriceReset(inflated, BASE, 1.05));
    expect(next.globalPrice).toBe(105);
    expect(Object.values(next.statePrices!)).toEqual([105, 105]);
    expect(Object.values(next.nationalPrices!)).toEqual([105, 105]);
    expect(next.reachablePrices).toEqual({ US: 105 });
    expect(next.scarcityMult).toBe(1);
    expect(next.scarcityMultByCountry).toEqual({ US: 1, CA: 1 });
    expect(next.scarcityImbalanceHistory).toBeUndefined();
    expect(next.scarcityImbalanceHistoryByCountry).toBeUndefined();
  });

  it("changes nothing on a second pass", () => {
    const once = apply(inflated, planOpeningPriceReset(inflated, BASE, 1));
    const again = planOpeningPriceReset(once, BASE, 1);
    expect(again.changed).toBe(false);
    expect(again.set).toEqual({});
    expect(again.unset).toEqual([]);
  });

  it("keeps a global peg and per-state pegs", () => {
    const pegged: OpeningPriceDoc = {
      ...inflated,
      hardPeg: 150,
      stateHardPegs: { a: 175 },
    };
    const patch = planOpeningPriceReset(pegged, BASE, 1);
    const next = apply(pegged, patch);
    expect(next.globalPrice).toBe(150);
    expect(next.statePrices).toEqual({ a: 175, b: 100 });
    expect(next.reachablePrices).toEqual({ US: 150 });
    expect(patch.pegsKept).toBe(2);
    expect(planOpeningPriceReset(next, BASE, 1).changed).toBe(false);
  });

  it("rewrites the price attribution so it reconciles to the new price", () => {
    const doc: OpeningPriceDoc = {
      ...inflated,
      priceAttribution: {
        appliedPrice: 240,
        realBasePrice: 100,
        nominalInflation: 0,
        scarcityMemory: 80,
        producerInputCostPassThrough: 0,
        marketBalance: 60,
        adjustmentLag: 0,
        explicitOverride: 0,
      },
    };
    const next = apply(doc, planOpeningPriceReset(doc, BASE, 1));
    const a = next.priceAttribution!;
    expect(a.appliedPrice).toBe(100);
    expect(a.scarcityMemory).toBe(0);
    expect(a.marketBalance).toBe(0);
  });

  it("leaves absent fields absent", () => {
    const bare: OpeningPriceDoc = { commodity: "steel", globalPrice: 100 };
    const patch = planOpeningPriceReset(bare, BASE, 1);
    expect(patch.changed).toBe(false);
  });
});
