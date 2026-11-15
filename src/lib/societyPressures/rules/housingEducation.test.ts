import { describe, expect, it } from "vitest";
import {
  COST_OF_LIVING_NUDGE_BOUNDS,
  advanceHousingStock,
  households,
  housingCostOfLivingNudge,
  housingPressureIndex,
} from "./housing";
import { advanceEducationIndex, educationIndexTarget } from "./education";
import { zoningConstructionEffectiveness } from "./laws";

const TPY = 48;

function runHousing(years: number, adultGrowth: number, supplyPct: number, zoning: number | null) {
  let adults = 10_000_000;
  let stock: number | undefined;
  let pressure = 100;
  for (let t = 0; t < years * TPY; t++) {
    const count = households(adults, "US");
    stock = advanceHousingStock({
      previousStock: stock,
      households: count,
      supplyGrowthPct: supplyPct,
      zoningEffectiveness: zoningConstructionEffectiveness(zoning),
      turnsPerYear: TPY,
    });
    pressure = housingPressureIndex(count, stock);
    adults *= 1 + adultGrowth / TPY;
  }
  return pressure;
}

describe("housing pressure", () => {
  it("opens balanced", () => {
    const count = households(1_900_000, "US");
    expect(count).toBeCloseTo(1_000_000, 6);
    const stock = advanceHousingStock({
      previousStock: undefined,
      households: count,
      supplyGrowthPct: 1,
      zoningEffectiveness: 1,
      turnsPerYear: TPY,
    });
    expect(housingPressureIndex(count, stock)).toBe(100);
  });

  it("rises when households outgrow construction, and zoning reform relieves it", () => {
    const tight = runHousing(10, 0.012, 1, null);
    expect(tight).toBeGreaterThan(104);
    const reformed = runHousing(10, 0.012, 1, 0);
    expect(reformed).toBeLessThan(tight);
    const restricted = runHousing(10, 0.012, 1, 6);
    expect(restricted).toBeGreaterThan(tight);
  });

  it("raises the cost of living above balance, within bounds", () => {
    expect(housingCostOfLivingNudge(100)).toBe(0);
    expect(housingCostOfLivingNudge(110)).toBe(5);
    expect(housingCostOfLivingNudge(200)).toBe(COST_OF_LIVING_NUDGE_BOUNDS[1]);
    expect(housingCostOfLivingNudge(60)).toBe(COST_OF_LIVING_NUDGE_BOUNDS[0]);
  });
});

describe("education index", () => {
  it("opens at its target", () => {
    const target = educationIndexTarget({ universityEnrollment: 50, spendingResponse: 38 });
    expect(advanceEducationIndex({ previous: undefined, target, turnsPerYear: TPY })).toBe(target);
  });

  it("targets higher with more education spending", () => {
    expect(
      educationIndexTarget({ universityEnrollment: 50, spendingResponse: 70 })
    ).toBeGreaterThan(educationIndexTarget({ universityEnrollment: 50, spendingResponse: 38 }));
  });

  it("drifts slowly: about 4% of the gap in a year", () => {
    let index = 30;
    for (let t = 0; t < TPY; t++)
      index = advanceEducationIndex({ previous: index, target: 40, turnsPerYear: TPY });
    expect(index).toBeCloseTo(30.4, 6);
  });
});
