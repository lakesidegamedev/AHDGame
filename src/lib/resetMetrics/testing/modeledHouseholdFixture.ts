import { householdProducerFixture } from "./householdProducerFixture";
import type { HouseholdIncomeModel } from "../rules/householdSources";
import type { HouseholdModelActivity } from "../rules/modelHouseholdIncome";

/** Controlled model inputs only; never installed as real country reference data. */
export function modeledHouseholdFixture(country: "US" | "UK" | "JP" = "US") {
  const f = householdProducerFixture(country);
  f.reference.cells = f.reference.cells.map((c) => ({
    ...c,
    labourIncome: c.marketIncome!,
    otherDirectTaxes: 0,
  }));
  const model: HouseholdIncomeModel = {
    employeePayrollShare: 1,
    worldId: f.worldId,
    countryId: country,
    sourceId: "fixture-calibration",
    referenceSourceId: f.reference.sourceId,
    year: 1991,
    preset: "1991-default",
    programRoles: f.current.programRoles.map((r) => ({
      ...r,
      eligibilityModel: { kind: "fixed-reference-groups" as const },
    })),
    regions: f.current.regions.map((r) => ({
      regionId: r.regionId,
      sourceAreas: [r.regionId],
      population: r.householdResidents,
      output: 100,
      costOfLiving: 100,
    })),
  };
  const activity: HouseholdModelActivity[] = model.regions.map((r) => ({
    regionId: r.regionId,
    output: r.output,
    population: r.population,
    costOfLiving: 100,
    regionalTaxes: { incomeTax: 0, residentTax: 0 },
  }));
  return {
    ...f,
    model,
    activity,
    preset: model.preset,
    nationalTaxes: { incomeTax: 0, payrollTax: 0 },
  };
}
