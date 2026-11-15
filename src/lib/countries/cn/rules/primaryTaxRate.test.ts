import { describe, expect, it } from "vitest";
import { resolvePrimaryTaxRate, type PrimaryTaxLaw } from "./primaryTaxRate";

const slider: PrimaryTaxLaw = { taxSlider: true, policyOptions: [] };
const legacy: PrimaryTaxLaw = {
  policyOptions: [
    { id: "cn_eit_opt_0", rate: 15 },
    { id: "cn_eit_opt_1", rate: 33 },
  ],
};

describe("resolvePrimaryTaxRate", () => {
  it("reads the rate a passed slider bill wrote", () => {
    expect(
      resolvePrimaryTaxRate({
        current: { policyOptionId: "rate:31", law: slider },
        nationalRate: 25,
        defaultRate: 25,
      })
    ).toBe(31);
  });

  it("reads the national budget rate when no bill has set the slider", () => {
    expect(resolvePrimaryTaxRate({ nationalRate: 18, defaultRate: 25 })).toBe(18);
  });

  it("keeps a saved world's enacted old-book rate", () => {
    expect(
      resolvePrimaryTaxRate({
        legacy: { policyOptionId: "cn_eit_opt_1", law: legacy },
        nationalRate: 18,
        defaultRate: 25,
      })
    ).toBe(33);
  });

  it("prefers a new-book bill over the old-book row", () => {
    expect(
      resolvePrimaryTaxRate({
        current: { policyOptionId: "rate:12", law: slider },
        legacy: { policyOptionId: "cn_eit_opt_1", law: legacy },
        defaultRate: 25,
      })
    ).toBe(12);
  });

  it("keeps a zero rate a bill enacted", () => {
    expect(
      resolvePrimaryTaxRate({
        current: { policyOptionId: "rate:0", law: slider },
        nationalRate: 18,
        defaultRate: 25,
      })
    ).toBe(0);
  });

  it("falls back to the default when nothing is set", () => {
    expect(resolvePrimaryTaxRate({ defaultRate: 25 })).toBe(25);
    expect(
      resolvePrimaryTaxRate({
        current: { policyOptionId: "unknown", law: legacy },
        defaultRate: 25,
      })
    ).toBe(25);
  });
});
