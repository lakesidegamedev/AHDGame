import { describe, expect, it } from "vitest";
import { COMMODITY_BASE_PRICES } from "@/lib/constants/commodities";
import { contractMoney, contractReferenceUnitPrice, contractSides } from "./contractPricing";
import { maxContractableUnits } from "@/lib/corporations/supplyAgreementCapacity";

describe("contract money", () => {
  it("applies the percentage to the reference price and converts the daily cap to a turn", () => {
    const m = contractMoney({
      volumeCapPerDay: 2400,
      pricePremium: 0.2,
      referenceUnitPrice: 100,
      durationTurns: 10,
    });
    expect(m.unitPrice).toBeCloseTo(120);
    expect(m.unitsPerTurn).toBeCloseTo(100);
    expect(m.valuePerTurn).toBeCloseTo(12_000);
    expect(m.valuePerDay).toBeCloseTo(288_000);
    expect(m.valueOverTerm).toBeCloseTo(120_000);
  });

  it("has no term total when open ended", () => {
    expect(
      contractMoney({ volumeCapPerDay: 24, pricePremium: 0, referenceUnitPrice: 5 }).valueOverTerm
    ).toBeNull();
  });

  it("reference sits under the board price when the board is far above base", () => {
    const base = COMMODITY_BASE_PRICES.steel;
    const reference = contractReferenceUnitPrice("steel", base * 1.6);
    expect(reference).toBeGreaterThan(base);
    expect(reference).toBeLessThan(base * 1.6);
    expect(reference).toBeCloseTo(base * Math.sqrt(1.6));
  });

  it("reference price equals base at a base-level board price", () => {
    const base = COMMODITY_BASE_PRICES.steel;
    expect(contractReferenceUnitPrice("steel", base)).toBeCloseTo(base);
    expect(contractReferenceUnitPrice("steel", undefined)).toBeCloseTo(base);
  });
});

describe("contractSides", () => {
  it("compares each side's contract price with its market price", () => {
    const sides = contractSides({
      referenceUnitPrice: 1100,
      marketUnitPrice: 1800,
      pricePremium: 0.35,
    });
    expect(sides.buyerMarketUnitPrice).toBe(1100);
    expect(sides.buyerContractUnitPrice).toBeCloseTo(1485);
    expect(sides.sellerMarketUnitPrice).toBe(1800);
    expect(sides.sellerContractUnitPrice).toBeCloseTo(2185);
  });

  it("gives the seller less than the market at the bottom of the band", () => {
    const sides = contractSides({
      referenceUnitPrice: 1100,
      marketUnitPrice: 1800,
      pricePremium: -0.35,
    });
    expect(sides.buyerContractUnitPrice).toBeCloseTo(715);
    expect(sides.sellerContractUnitPrice).toBeCloseTo(1415);
  });

  it("falls back to the billed price when no market price is known", () => {
    const sides = contractSides({ referenceUnitPrice: 1100, pricePremium: 0.1 });
    expect(sides.sellerMarketUnitPrice).toBe(1100);
    expect(sides.sellerContractUnitPrice).toBeCloseTo(1210);
  });
});

describe("maxContractableUnits", () => {
  it("never exceeds the latest achievable output", () => {
    expect(maxContractableUnits(12_254, 11_188)).toBe(11_188);
  });
  it("uses nameplate headroom when no output is recorded", () => {
    expect(maxContractableUnits(1000, null)).toBeCloseTo(1200);
  });
  it("keeps the nameplate ceiling when output is higher", () => {
    expect(maxContractableUnits(1000, 5000)).toBeCloseTo(1200);
  });
});
