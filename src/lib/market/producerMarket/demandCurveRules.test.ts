import { describe, expect, it } from "vitest";
import {
  DEMAND_CURVE_MAX_EXTRA_SPEND,
  DEMAND_CURVE_STEPS,
  demandSteps,
  incomeAdjustedWeights,
  householdSpendFraction,
  incomeIndexByState,
} from "./demandCurveRules";
import { householdPurchaseOrders } from "./householdRules";

describe("demandSteps", () => {
  it("keeps the old single order as the top step", () => {
    const [top] = demandSteps({ budget: 1_000, maximumUnitPrice: 10, priceElasticity: 1 });
    expect(top).toEqual({ step: 0, maximumUnitPrice: 10, units: 100, maximumSpend: 1_000 });
  });

  it("adds no steps for a good that does not react to price", () => {
    expect(demandSteps({ budget: 1_000, maximumUnitPrice: 10, priceElasticity: 0 })).toHaveLength(
      1
    );
  });

  it("buys more units at lower prices, following the elasticity", () => {
    const steps = demandSteps({ budget: 1_000, maximumUnitPrice: 10, priceElasticity: 0.5 });
    expect(steps.map((s) => s.maximumUnitPrice)).toEqual(DEMAND_CURVE_STEPS.map((m) => 10 * m));
    // Cumulative units at the 0.7 step: 100 * 0.7^-0.5.
    const upTo = steps.slice(0, 3).reduce((n, s) => n + s.units, 0);
    expect(upTo).toBeCloseTo(100 * Math.pow(0.7, -0.5), 9);
    for (const s of steps.slice(1)) expect(s.units).toBeGreaterThan(0);
  });

  it("caps the extra spending the lower steps may reserve", () => {
    const steps = demandSteps({ budget: 1_000, maximumUnitPrice: 10, priceElasticity: 3 });
    const extra = steps.slice(1).reduce((n, s) => n + s.maximumSpend, 0);
    expect(extra).toBeLessThanOrEqual(1_000 * DEMAND_CURVE_MAX_EXTRA_SPEND + 1e-9);
  });

  it("returns nothing for an empty budget or bad price", () => {
    expect(demandSteps({ budget: 0, maximumUnitPrice: 10, priceElasticity: 1 })).toEqual([]);
    expect(demandSteps({ budget: 10, maximumUnitPrice: 0, priceElasticity: 1 })).toEqual([]);
  });
});

describe("incomeAdjustedWeights", () => {
  const basket = [
    { commodity: "food", weight: 0.5 },
    { commodity: "vehicles", weight: 0.5 },
  ];

  it("leaves a median-income basket unchanged", () => {
    expect(incomeAdjustedWeights(basket, 1)).toEqual(basket);
  });

  it("shifts a richer household toward discretionary goods, same total", () => {
    const rich = incomeAdjustedWeights(basket, 2);
    const food = rich.find((p) => p.commodity === "food")!.weight;
    const cars = rich.find((p) => p.commodity === "vehicles")!.weight;
    expect(cars).toBeGreaterThan(food);
    expect(food + cars).toBeCloseTo(1, 12);
  });

  it("shifts a poorer household toward essentials", () => {
    const poor = incomeAdjustedWeights(basket, 0.5);
    expect(poor.find((p) => p.commodity === "food")!.weight).toBeGreaterThan(0.5);
  });

  it("clamps a degenerate income index", () => {
    expect(incomeAdjustedWeights(basket, 1e9)).toEqual(incomeAdjustedWeights(basket, 4));
  });
});

describe("incomeIndexByState", () => {
  it("measures each state against the median", () => {
    const index = incomeIndexByState([
      { stateId: "A", income: 10 },
      { stateId: "B", income: 20 },
      { stateId: "C", income: 40 },
    ]);
    expect(index.get("B")).toBe(1);
    expect(index.get("C")).toBe(2);
    expect(index.get("A")).toBe(0.5);
  });

  it("leaves out states without a usable income", () => {
    expect(incomeIndexByState([{ stateId: "A", income: Number.NaN }]).size).toBe(0);
  });
});

describe("householdPurchaseOrders with demand curves", () => {
  const wallet = {
    accountId: "hh",
    cash: 1_000,
    spendFraction: 1,
    products: [
      { commodity: "food", book: "world", maximumUnitPrice: 10, weight: 1 },
      { commodity: "vehicles", book: "world", maximumUnitPrice: 100, weight: 1 },
    ],
  };

  it("is unchanged when the stage is off", () => {
    expect(householdPurchaseOrders(wallet)).toHaveLength(2);
  });

  it("keeps the top step identical to the single order", () => {
    const off = householdPurchaseOrders(wallet);
    const on = householdPurchaseOrders({ ...wallet, demandCurve: { incomeIndex: 1 } });
    for (const order of off) expect(on.find((o) => o.id === order.id)).toEqual(order);
  });

  it("adds marked lower steps at lower prices", () => {
    const on = householdPurchaseOrders({ ...wallet, demandCurve: { incomeIndex: 1 } });
    const lower = on.filter((o) => (o.demandStep ?? 0) > 0);
    expect(lower.length).toBeGreaterThan(0);
    for (const o of lower) {
      const top = on.find((t) => t.commodity === o.commodity && !t.demandStep)!;
      expect(o.maximumUnitPrice).toBeLessThan(top.maximumUnitPrice);
    }
    expect(new Set(on.map((o) => o.id)).size).toBe(on.length);
  });
});

describe("householdSpendFraction", () => {
  it("keeps the base share at the neutral rate or with no rate", () => {
    expect(householdSpendFraction(0.9, 5)).toBe(0.9);
    expect(householdSpendFraction(0.9, undefined)).toBe(0.9);
  });

  it("saves more when money is dear and spends more when it is cheap", () => {
    expect(householdSpendFraction(0.9, 10)).toBeCloseTo(0.85, 12);
    expect(householdSpendFraction(0.9, 1)).toBeCloseTo(0.94, 12);
  });

  it("stays inside its bounds", () => {
    expect(householdSpendFraction(0.9, 60)).toBe(0.75);
    expect(householdSpendFraction(0.9, -40)).toBe(0.97);
  });
});
