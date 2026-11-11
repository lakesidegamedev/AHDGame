import { describe, expect, it } from "vitest";
import { calculateEnactedLawAnnualCost } from "@/lib/budget/costs";
import type { EnactedLaw } from "@/lib/db/types";
import { LEGISLATION_COST_CLASS, getCostClass } from "./legislationCostCatalog";
import { SAVED_WORLD_COST_CLASS } from "./savedWorldCostClasses";

describe("saved-world cost classes", () => {
  it("only lists types that new worlds no longer seed", () => {
    for (const id of Object.keys(SAVED_WORLD_COST_CLASS))
      expect(LEGISLATION_COST_CLASS[id], id).toBeUndefined();
  });

  it("keeps the class an old law carried while it was seeded", () => {
    expect(getCostClass("jp_national_health_insurance")).toBe("perCapita");
    expect(getCostClass("de_pension_system")).toBe("perCapita");
    expect(getCostClass("jp_defense_spending")).toBe("gdpFraction");
    expect(getCostClass("jp_income_tax_rate")).toBe("none");
  });

  it("still prices an enacted old program in a saved world", () => {
    // A saved-world row as it is stored: legacy multiplier, no era fractions.
    const law = {
      legislationTypeId: "jp_national_health_insurance",
      countryId: "JP",
      scope: "national",
      budgetCategory: "healthcare",
      budgetCost: 0,
      gdpPerCapitaMultiplier: 0.0676,
      policyOptionIndex: 3,
    } as unknown as EnactedLaw;
    const cost = calculateEnactedLawAnnualCost(law, {
      budgetCapacity: 1,
      gdp: 1_000_000,
      population: 100,
      countryId: "JP",
      year: 2006,
    });
    expect(cost).toBeCloseTo(67_600, 6);
  });
});
