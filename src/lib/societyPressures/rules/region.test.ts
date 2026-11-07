import { describe, expect, it } from "vitest";
import { advanceRegionSocietyPressures, type RegionSocietyInput } from "./region";
import { NO_SOCIETY_LAWS, societyLawPositionsByCountry } from "./laws";

const base: RegionSocietyInput = {
  turn: 10,
  turnsPerYear: 48,
  countryId: "JP",
  adults: 1_800_000,
  automationDisplaced: 1000,
  supplyGrowthPct: 1,
  universityEnrollment: 50,
  educationSpendingResponse: 38,
  outputGap: 0,
  laws: NO_SOCIETY_LAWS,
};

describe("societyLawPositionsByCountry", () => {
  it("reads country and law from the type id", () => {
    const map = societyLawPositionsByCountry([
      { legislationTypeId: "jp_pension_age_indexation", policyOptionIndex: 5 },
      { legislationTypeId: "jp_housing_supply_reform", policyOptionIndex: 1 },
      { legislationTypeId: "de_wage_insurance", policyOptionIndex: 0 },
      { legislationTypeId: "de_automation_tax", policyOptionIndex: 2 },
      { legislationTypeId: "cn_wage_insurance", policyOptionIndex: 9 },
    ]);
    expect(map.get("JP")).toEqual({ pensionIndexation: 5, zoning: 1, wageInsurance: null });
    expect(map.get("DE")).toEqual({ pensionIndexation: null, zoning: null, wageInsurance: 0 });
    expect(map.get("CN")).toEqual(NO_SOCIETY_LAWS);
  });
});

describe("advanceRegionSocietyPressures", () => {
  it("opens balanced housing, begins absorbing displaced workers and records the turn", () => {
    const out = advanceRegionSocietyPressures(base);
    expect(out.state.housingPressure).toBe(100);
    expect(out.costOfLivingNudge).toBe(0);
    expect(out.state.automationDisplaced).toBe(1000);
    expect(out.absorbedJobs).toBeGreaterThan(0);
    expect(out.absorbedJobs).toBeLessThan(10);
    expect(out.state.lastTurn).toBe(10);
  });

  it("returns the stored state on a replayed turn", () => {
    const first = advanceRegionSocietyPressures(base);
    const replay = advanceRegionSocietyPressures({ ...base, previous: first.state, adults: 9e9 });
    expect(replay.state).toBe(first.state);
  });

  it("keeps the displaced reading when the corporate turn did not report one", () => {
    const first = advanceRegionSocietyPressures(base);
    const next = advanceRegionSocietyPressures({
      ...base,
      turn: 11,
      previous: first.state,
      automationDisplaced: undefined,
    });
    expect(next.state.automationDisplaced).toBe(1000);
    expect(next.absorbedJobs).toBeGreaterThan(first.absorbedJobs);
  });
});
