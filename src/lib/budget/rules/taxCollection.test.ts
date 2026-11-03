import { describe, expect, it } from "vitest";
import { outstandingTax, planTaxCollection } from "./taxCollection";

describe("partial tax debt collection", () => {
  it("collects available cash rather than skipping an unaffordable bill", () => {
    const plan = planTaxCollection({ federal: 80, regional: 20 }, 35, 1, 1);
    expect(plan.walletDebit).toBe(35);
    expect(plan.slice).toMatchObject({ federal: 28, regional: 7, fullyPaid: false });
    expect(
      outstandingTax({ federal: 80, regional: 20, collectedFederal: 28, collectedRegional: 7 })
    ).toEqual({ federal: 52, regional: 13 });
    const final = planTaxCollection(
      { federal: 80, regional: 20, collectedFederal: 28, collectedRegional: 7 },
      100,
      1,
      1
    );
    expect(final.walletDebit).toBe(65);
    expect(final.slice.fullyPaid).toBe(true);
  });
  it.each([1, 0.75, 118.6, 0.006])("never overdrafts converted wallet at FX %s", (rate) => {
    for (const available of [0, 0.001, 0.5, 5.25, 1000000]) {
      const plan = planTaxCollection(
        { federal: 72061834416, regional: 1000000 },
        available,
        rate,
        1
      );
      expect(plan.walletDebit).toBeLessThanOrEqual(available + 1e-6);
      expect(plan.walletDebit).toBeGreaterThanOrEqual(0);
    }
  });
  it("rejects impossible cumulative collections", () => {
    expect(() => outstandingTax({ federal: 5, regional: 0, collectedFederal: 6 })).toThrow();
    expect(() => planTaxCollection({ federal: 5, regional: 0 }, NaN, 1)).toThrow();
  });
});
