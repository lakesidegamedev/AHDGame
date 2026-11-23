import { describe, expect, it } from "vitest";
import { COMMODITY_BASE_PRICES } from "@/lib/constants/commodities";
import {
  contractMoney,
  contractReferenceUnitPrice,
  contractSides,
  fixedPriceBounds,
  newModeSides,
  pricingTermsError,
} from "./contractPricing";
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

describe("new price modes", () => {
  it("bounds a set price to 25% either side of the market", () => {
    expect(fixedPriceBounds(100)).toEqual({ min: 75, max: 125 });
    expect(pricingTermsError({ priceMode: "fixed", fixedUnitPrice: 125 }, 100)).toBeNull();
    expect(pricingTermsError({ priceMode: "fixed", fixedUnitPrice: 126 }, 100)).toMatch(
      /between 75\.00 and 125\.00/
    );
    expect(pricingTermsError({ priceMode: "fixed", fixedUnitPrice: 74 }, 100)).not.toBeNull();
  });

  it("refuses a set price with no market price, and a missing mode", () => {
    expect(pricingTermsError({ priceMode: "fixed", fixedUnitPrice: 10 }, null)).toMatch(
      /no market price/
    );
    expect(pricingTermsError({ pricePremium: 0.1 }, 100)).toMatch(/Choose how the price works/);
  });

  it("bounds market plus or minus to 35%", () => {
    expect(pricingTermsError({ priceMode: "indexed", pricePremium: 0.35 }, 100)).toBeNull();
    expect(pricingTermsError({ priceMode: "indexed", pricePremium: -0.36 }, 100)).not.toBeNull();
  });

  it("gives the seller exactly the contract price and the buyer bill plus transfer", () => {
    const fixed = newModeSides({
      priceMode: "fixed",
      fixedUnitPrice: 110,
      pricePremium: 0.1,
      marketUnitPrice: 100,
      billedUnitPrice: 95,
    });
    expect(fixed).toEqual({
      sellerUnitPrice: 110,
      buyerBillUnitPrice: 95,
      transferPerUnit: 10,
      buyerNetUnitPrice: 105,
    });
    const indexed = newModeSides({
      priceMode: "indexed",
      pricePremium: -0.1,
      marketUnitPrice: 100,
      billedUnitPrice: 95,
    });
    expect(indexed.sellerUnitPrice).toBeCloseTo(90);
    expect(indexed.buyerNetUnitPrice).toBeCloseTo(85);
  });
});
