import { describe, expect, it } from "vitest";
import { COMMODITY_BASE_PRICES } from "@/lib/constants/commodities";
import { contractMoney, contractReferenceUnitPrice } from "./contractPricing";
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
    expect(m.valueOverTerm).toBeCloseTo(120_000);
  });

  it("has no term total when open ended", () => {
    expect(
      contractMoney({ volumeCapPerDay: 24, pricePremium: 0, referenceUnitPrice: 5 }).valueOverTerm
    ).toBeNull();
  });

  it("reference price equals base at a base-level board price", () => {
    const base = COMMODITY_BASE_PRICES.steel;
    expect(contractReferenceUnitPrice("steel", base)).toBeCloseTo(base);
    expect(contractReferenceUnitPrice("steel", undefined)).toBeCloseTo(base);
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
