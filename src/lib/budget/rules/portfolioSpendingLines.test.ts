import { describe, expect, it } from "vitest";
import {
  spendingAreaForLaw,
  splitOtherByArea,
  liftHousingFromCategories,
} from "./portfolioSpendingLines";

describe("spendingAreaForLaw", () => {
  it("reads the administering portfolio first", () => {
    expect(spendingAreaForLaw({ portfolioId: "environment_energy" })).toBe("environment");
    expect(spendingAreaForLaw({ portfolioId: "justice", policyDomain: "publicSafety" })).toBe(
      "justice"
    );
    expect(spendingAreaForLaw({ portfolioId: "housing" })).toBe("housing");
  });

  it("keeps voting and elections laws out of justice and economy laws out of any area", () => {
    expect(spendingAreaForLaw({ portfolioId: "justice", policyDomain: "governance" })).toBe(
      undefined
    );
    expect(spendingAreaForLaw({ portfolioId: "economy_industry" })).toBe(undefined);
  });

  it("falls back to the policy domain when no portfolio is stored", () => {
    expect(spendingAreaForLaw({ policyDomain: "environment" })).toBe("environment");
    expect(spendingAreaForLaw({ policyDomain: "publicSafety" })).toBe("justice");
    expect(spendingAreaForLaw({ policyDomain: "governance" })).toBe(undefined);
  });

  it("finds housing laws filed under infrastructure", () => {
    expect(
      spendingAreaForLaw({
        legislationTypeId: "ca.infrastructure.publicHousing.primary",
        policyDomain: "infrastructure",
      })
    ).toBe("housing");
    expect(
      spendingAreaForLaw({
        legislationTypeId: "ca.sec.urbanRenewal",
        policyDomain: "infrastructure",
      })
    ).toBe("housing");
  });
});

describe("splitOtherByArea", () => {
  const items = [
    { law: "parks", area: "environment" as const, amount: 30 },
    { law: "rivers", area: "environment" as const, amount: 20 },
    { law: "courts", area: "justice" as const, amount: 10 },
    { law: "audit", area: undefined, amount: 15 },
  ];

  it("sums real law costs per area and leaves the rest, without double counting", () => {
    const out = splitOtherByArea(100, items);
    expect(out.lines.map((l) => [l.id, l.amount])).toEqual([
      ["environment", 50],
      ["justice", 10],
    ]);
    expect(out.remainderTotal).toBe(40);
    expect(out.remainderLaws).toEqual(["audit"]);
    expect(out.lines.reduce((s, l) => s + l.amount, 0) + out.remainderTotal).toBe(100);
  });

  it("scales areas down together when live costs overshoot the stored line", () => {
    const out = splitOtherByArea(30, items);
    const total = out.lines.reduce((s, l) => s + l.amount, 0);
    expect(total).toBeCloseTo(30, 10);
    expect(out.remainderTotal).toBeCloseTo(0, 10);
  });

  it("returns the line untouched when nothing is priced", () => {
    const out = splitOtherByArea(100, [{ law: "x", area: "housing", amount: null }]);
    expect(out.lines).toEqual([]);
    expect(out.remainderTotal).toBe(100);
  });
});

describe("liftHousingFromCategories", () => {
  it("lifts housing laws booked under infrastructure out of that category", () => {
    const out = liftHousingFromCategories({ infrastructure: 100, other: 50 }, [
      { law: "public housing", category: "infrastructure", amount: 30 },
      { law: "urban renewal", category: "infrastructure", amount: 20 },
    ]);
    expect(out.amountByCategory).toEqual({ infrastructure: 50 });
    expect(out.total).toBe(50);
    expect(out.laws).toEqual(["public housing", "urban renewal"]);
  });

  it("never takes more than the category holds", () => {
    const out = liftHousingFromCategories({ infrastructure: 40 }, [
      { law: "a", category: "infrastructure", amount: 60 },
      { law: "b", category: "infrastructure", amount: 20 },
    ]);
    expect(out.total).toBeCloseTo(40, 10);
  });

  it("ignores unpriced laws and empty categories", () => {
    const out = liftHousingFromCategories({ infrastructure: 0 }, [
      { law: "a", category: "infrastructure", amount: 10 },
      { law: "b", category: "education", amount: null },
    ]);
    expect(out.total).toBe(0);
    expect(out.laws).toEqual([]);
  });
});
