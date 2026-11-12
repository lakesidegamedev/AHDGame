import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateEnactedLawAnnualCost } from "@/lib/budget/costs";
import type { EnactedLaw } from "@/lib/db/types";
import { LEGISLATION_COST_CLASS, getCostClass } from "./legislationCostCatalog";
import { SAVED_WORLD_COST_CLASS } from "./savedWorldCostClasses";
import KNOWN_COST_CLASS_IDS from "./costClassIds.snapshot.json";

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
    expect(getCostClass("cn_pension_system")).toBe("perCapita");
    expect(getCostClass("cn_pla_modernization")).toBe("gdpFraction");
    expect(getCostClass("cn_value_added_tax")).toBe("none");
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

describe("saved-world cost class table source", () => {
  it("lists each law type once", () => {
    // Two branches can each move the same removed rows here; a repeated key
    // compiles under the test runner but fails the type checker.
    const source = readFileSync(join(__dirname, "savedWorldCostClasses.ts"), "utf8");
    const keys = [...source.matchAll(/^  ([a-z0-9_]+): "/gm)].map((m) => m[1]);
    expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([]);
  });
});

describe("removing a law type from the cost catalog", () => {
  const classed = (id: string) => id in LEGISLATION_COST_CLASS || id in SAVED_WORLD_COST_CLASS;

  it("keeps every once-classed id in one of the two tables", () => {
    // Saved worlds still hold enacted laws of removed types. Move a removed
    // row into SAVED_WORLD_COST_CLASS, or its programmes price at zero.
    expect(KNOWN_COST_CLASS_IDS.filter((id) => !classed(id))).toEqual([]);
  });

  it("lists every classed id in the snapshot", () => {
    // Add new ids to costClassIds.snapshot.json so a later removal is caught.
    const known = new Set(KNOWN_COST_CLASS_IDS);
    const ids = [...Object.keys(LEGISLATION_COST_CLASS), ...Object.keys(SAVED_WORLD_COST_CLASS)];
    expect(ids.filter((id) => !known.has(id) && !/^(x_|eraB_)/.test(id))).toEqual([]);
  });
});
