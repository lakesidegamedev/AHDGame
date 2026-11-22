import { describe, expect, it } from "vitest";
import {
  allocateDemandCurve,
  DEMAND_CURVE_PRICE_SENSITIVITY,
  sellerPreferenceFactor,
  type DemandCurveOffer,
} from "./demandCurveRules";

const curve = (preferenceByAccount: Record<string, number> = {}) => ({
  priceSensitivity: DEMAND_CURVE_PRICE_SENSITIVITY,
  preferenceByAccount,
});
const offer = (id: string, unitPrice: number, remaining: number, accountId = id) =>
  ({ id, accountId, unitPrice, remaining }) satisfies DemandCurveOffer;
const unitsOf = (groups: ReturnType<typeof allocateDemandCurve>, id: string) => {
  const group = groups!.find((g) => g.offerIds.includes(id));
  return group ? group.units : 0;
};

describe("sellerPreferenceFactor", () => {
  it("is neutral at 50 and for missing or invalid values", () => {
    expect(sellerPreferenceFactor(50, 50)).toBe(1);
    expect(sellerPreferenceFactor(undefined, null)).toBe(1);
    expect(sellerPreferenceFactor(Number.NaN, 50)).toBe(1);
  });
  it("stays within 0.75 to 1.25", () => {
    expect(sellerPreferenceFactor(100, 100)).toBe(1.25);
    expect(sellerPreferenceFactor(0, 0)).toBe(0.75);
    expect(sellerPreferenceFactor(500, 500)).toBe(1.25);
  });
  it("averages brand and quality", () => {
    expect(sellerPreferenceFactor(100, 50)).toBeCloseTo(1.125, 10);
  });
});

describe("allocateDemandCurve", () => {
  it("equal prices and preference split pro rata by remaining, as one group", () => {
    const out = allocateDemandCurve({
      offers: [offer("a", 10, 300), offer("b", 10, 100)],
      wanted: 200,
      budget: 1e9,
      curve: curve(),
    })!;
    expect(out).toHaveLength(1);
    expect(out[0].units).toBeCloseTo(200, 9);
    expect(out[0].offerIds).toEqual(["a", "b"]);
  });

  it("gives a seller 20% dearer 0.8^4 of the weight per unit", () => {
    const out = allocateDemandCurve({
      offers: [offer("cheap", 100, 1000), offer("dear", 120, 1000)],
      wanted: 500,
      budget: 1e9,
      curve: curve(),
    });
    const cheap = unitsOf(out, "cheap");
    const dear = unitsOf(out, "dear");
    expect(cheap + dear).toBeCloseTo(500, 9);
    expect(dear / cheap).toBeCloseTo(Math.pow(100 / 120, 4), 9);
  });

  it("weights preference 1.25 against 0.75 at the same price", () => {
    const out = allocateDemandCurve({
      offers: [offer("a", 10, 1000), offer("b", 10, 1000)],
      wanted: 400,
      budget: 1e9,
      curve: curve({ a: 1.25, b: 0.75 }),
    });
    expect(unitsOf(out, "a") / unitsOf(out, "b")).toBeCloseTo(1.25 / 0.75, 9);
    expect(out).toHaveLength(2);
  });

  it("caps a small seller at what it has and spreads the rest", () => {
    const out = allocateDemandCurve({
      offers: [offer("small", 10, 10), offer("big", 10, 1000)],
      wanted: 500,
      budget: 1e9,
      curve: curve({ small: 1.25 }),
    });
    expect(unitsOf(out, "small")).toBeLessThanOrEqual(10);
    expect(unitsOf(out, "small") + unitsOf(out, "big")).toBeCloseTo(500, 9);
  });

  it("takes everything when demand exceeds supply", () => {
    const out = allocateDemandCurve({
      offers: [offer("a", 10, 30), offer("b", 14, 20)],
      wanted: 1000,
      budget: 1e9,
      curve: curve(),
    });
    expect(unitsOf(out, "a")).toBeCloseTo(30, 9);
    expect(unitsOf(out, "b")).toBeCloseTo(20, 9);
  });

  it("limits spend to the budget", () => {
    const out = allocateDemandCurve({
      offers: [offer("a", 10, 1000), offer("b", 12, 1000)],
      wanted: 500,
      budget: 2000,
      curve: curve(),
    })!;
    const spend = out.reduce((sum, g) => sum + g.units * g.unitPrice, 0);
    expect(spend).toBeCloseTo(2000, 6);
    for (const g of out) expect(g.units).toBeLessThanOrEqual(1000);
  });

  it("returns nothing for zero demand, no budget or no stock", () => {
    const base = { offers: [offer("a", 10, 5)], curve: curve() };
    expect(allocateDemandCurve({ ...base, wanted: 0, budget: 100 })).toEqual([]);
    expect(allocateDemandCurve({ ...base, wanted: 5, budget: 0 })).toEqual([]);
    expect(
      allocateDemandCurve({ offers: [offer("a", 10, 0)], wanted: 5, budget: 100, curve: curve() })
    ).toEqual([]);
  });

  it("one seller sells min(wanted, remaining)", () => {
    const one = (wanted: number) =>
      allocateDemandCurve({ offers: [offer("a", 10, 40)], wanted, budget: 1e9, curve: curve() })!;
    expect(one(25)[0].units).toBeCloseTo(25, 9);
    expect(one(90)[0].units).toBeCloseTo(40, 9);
  });

  it("defers to cheapest-first when the cheapest price is free", () => {
    expect(
      allocateDemandCurve({
        offers: [offer("a", 0, 10), offer("b", 5, 10)],
        wanted: 5,
        budget: 100,
        curve: curve(),
      })
    ).toBeNull();
  });

  it("does not depend on offer order", () => {
    const offers = [offer("c", 12, 70), offer("a", 10, 50), offer("b", 11, 60)];
    const run = (rows: DemandCurveOffer[]) =>
      allocateDemandCurve({ offers: rows, wanted: 90, budget: 1e9, curve: curve() });
    expect(run([...offers].reverse())).toEqual(run(offers));
  });

  // Two cheap sellers at 395 and seven dearer at 494, demand below the cheap tier.
  it("lets dearer sellers sell a share in a cheap-tier-covers-demand market", () => {
    const cheapA = sellerPreferenceFactor(85, 77);
    const cheapB = sellerPreferenceFactor(99, 85);
    const dear = [
      [60, 55],
      [40, 45],
      [70, 62],
      [30, 40],
      [50, 50],
      [55, 65],
      [45, 35],
    ] as const;
    const preferences: Record<string, number> = { cheapA, cheapB };
    const offers: DemandCurveOffer[] = [offer("cheapA", 395, 7000), offer("cheapB", 395, 5191)];
    dear.forEach(([brand, quality], i) => {
      preferences[`d${i}`] = sellerPreferenceFactor(brand, quality);
      offers.push(offer(`d${i}`, 494, 143));
    });
    const out = allocateDemandCurve({
      offers,
      wanted: 8291,
      budget: 1e12,
      curve: curve(preferences),
    })!;
    const cheapShare = (unitsOf(out, "cheapA") + unitsOf(out, "cheapB")) / 12191;
    const dearShare = dear.reduce((n, _, i) => n + unitsOf(out, `d${i}`), 0) / (143 * 7);
    expect(cheapShare).toBeGreaterThan(0.65);
    expect(cheapShare).toBeLessThan(0.69);
    expect(dearShare).toBeGreaterThan(0.2);
    expect(dearShare).toBeLessThan(0.28);
    expect(out.reduce((n, g) => n + g.units, 0)).toBeCloseTo(8291, 6);
  });
});
