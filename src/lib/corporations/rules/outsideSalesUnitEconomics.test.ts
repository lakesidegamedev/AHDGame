import { describe, expect, it } from "vitest";
import { outsideSalesUnitEconomics } from "./outsideSalesUnitEconomics";

describe("outsideSalesUnitEconomics", () => {
  it("matches total profit per unit sold when nothing goes to own sites", () => {
    const r = outsideSalesUnitEconomics({
      producedUnits: 100,
      soldUnits: 80,
      revenue: 80_000,
      inputsConsumed: 20_000,
      labourPaid: 10_000,
      otherOperatingPaid: 4_000,
      internalSupplyCharge: 8_000,
    });
    expect(r.profitPerUnit).toBeCloseTo((80_000 - 42_000) / 80);
    expect(r.ownSiteUnits).toBe(0);
  });

  it("does not load own-site deliveries onto outside sales", () => {
    const base = {
      producedUnits: 100,
      soldUnits: 50,
      revenue: 50_000,
      inputsConsumed: 10_000,
      labourPaid: 5_000,
    };
    const without = outsideSalesUnitEconomics(base);
    const withOwn = outsideSalesUnitEconomics({
      ...base,
      products: [{ internalDeliveredUnits: 50, askingUnitPrice: 1000 }],
    });
    // Half the bill belongs to the 50 own-site units, so each outside unit costs half as much.
    expect(withOwn.unitMaterials).toBeCloseTo(100);
    expect(without.unitMaterials).toBeCloseTo(200);
    expect(withOwn.profitPerUnit).toBeCloseTo(1000 - 150);
    expect(withOwn.ownSiteValueAtAsk).toBe(50_000);
  });

  it("is empty when nothing sold outside, and ignores non-finite input", () => {
    const r = outsideSalesUnitEconomics({
      producedUnits: Number.NaN,
      soldUnits: 0,
      products: [{ internalDeliveredUnits: 5, askingUnitPrice: 10 }],
    });
    expect(r.profitPerUnit).toBeNull();
    expect(r.ownSiteUnits).toBe(5);
    expect(r.ownSiteValueAtAsk).toBe(50);
  });
});
