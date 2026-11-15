import { describe, expect, it } from "vitest";
import {
  COUNTRY_FERTILITY_PATHS,
  DEFAULT_FERTILITY_PATH,
  MORTALITY_IMPROVEMENT_FLOOR,
  POLICY_TFR_SWING,
  lifeExpectancyGain,
  mortalityImprovementFactor,
  pathTfr,
  policyTfrShift,
  presetUsesDemographicPaths,
  regionPathTfr,
  regionalFertilityRatio,
} from "./demographicPaths";
import { perAgeMortality, healthcareMortalityModifier } from "../flows/mortality";
import { birthRateIndexToTFR } from "../flows/fertility";
import { advanceCohort, type CohortInputs } from "../cohortFlows";
import { synthesizeAgeSexVector } from "../seedSynthesis";

/** Period life expectancy at birth from an annual mortality schedule. */
function periodLifeExpectancy(sex: "male" | "female", multiplier: number): number {
  let alive = 1;
  let years = 0;
  for (let age = 0; age < 100; age++) {
    const q = Math.min(1, perAgeMortality(sex, age) * multiplier);
    years += alive * (1 - q / 2);
    alive *= 1 - q;
  }
  // Age 100 absorbs: expected remaining years at a constant terminal rate.
  return years + alive / Math.min(1, perAgeMortality(sex, 100) * multiplier);
}

describe("presetUsesDemographicPaths", () => {
  it("opts in the 2027 world only", () => {
    expect(presetUsesDemographicPaths("2027-default")).toBe(true);
    for (const preset of ["1953-default", "1991-default", "2019-default", "2023-default", "empty"])
      expect(presetUsesDemographicPaths(preset)).toBe(false);
    expect(presetUsesDemographicPaths(undefined)).toBe(false);
  });
});

describe("pathTfr", () => {
  it("starts on the 2027 table value and ends on the 2050 central value", () => {
    for (const [country, path] of Object.entries(COUNTRY_FERTILITY_PATHS)) {
      expect(pathTfr(country, 2027)).toBeCloseTo(path.start, 10);
      expect(pathTfr(country, 2050)).toBeCloseTo(path.end, 10);
    }
    expect(pathTfr("US", 2027)).toBeCloseTo(1.6, 10);
    expect(pathTfr("CN", 2050)).toBeCloseTo(1.05, 10);
  });

  it("interpolates linearly between the anchors", () => {
    // 2038.5 is halfway through 2027-2050.
    expect(pathTfr("JP", 2038.5)).toBeCloseTo((1.15 + 1.2) / 2, 10);
    expect(pathTfr("US", 2030)).toBeCloseTo(1.6 + (1.55 - 1.6) * (3 / 23), 10);
  });

  it("holds flat after 2050 and before 2027", () => {
    expect(pathTfr("DE", 2075)).toBeCloseTo(pathTfr("DE", 2050), 10);
    expect(pathTfr("DE", 2010)).toBeCloseTo(pathTfr("DE", 2027), 10);
  });

  it("gives other countries the default path", () => {
    expect(pathTfr("FR", 2027)).toBeCloseTo(DEFAULT_FERTILITY_PATH.start, 10);
    expect(pathTfr("FR", 2050)).toBeCloseTo(DEFAULT_FERTILITY_PATH.end, 10);
  });
});

describe("policy bounds", () => {
  it("moves TFR by at most the swing either way and not at all at neutral", () => {
    expect(policyTfrShift(50)).toBe(0);
    expect(policyTfrShift(null)).toBe(0);
    expect(policyTfrShift(100)).toBeCloseTo(POLICY_TFR_SWING, 10);
    expect(policyTfrShift(0)).toBeCloseTo(-POLICY_TFR_SWING, 10);
    expect(policyTfrShift(250)).toBeCloseTo(POLICY_TFR_SWING, 10);
    expect(policyTfrShift(-40)).toBeCloseTo(-POLICY_TFR_SWING, 10);
  });

  it("keeps a region on its country's mean within the policy band", () => {
    const at = (score: number | null) =>
      regionPathTfr({
        countryId: "UK",
        year: 2040,
        demographyScore: score,
        regionIndex: 37,
        countryMeanIndex: 37,
      });
    const central = pathTfr("UK", 2040);
    expect(at(null)).toBeCloseTo(central, 10);
    expect(at(100) - central).toBeCloseTo(0.3, 10);
    expect(central - at(0)).toBeCloseTo(0.3, 10);
  });

  it("keeps the seeded regional spread, bounded", () => {
    expect(regionalFertilityRatio(40, 40)).toBe(1);
    expect(regionalFertilityRatio(45, 40)).toBeGreaterThan(1);
    expect(regionalFertilityRatio(35, 40)).toBeLessThan(1);
    expect(regionalFertilityRatio(100, 10)).toBe(1.4);
    expect(regionalFertilityRatio(0, 100)).toBe(0.7);
  });
});

describe("mortality improvement", () => {
  it("is neutral in 2027 and gains 0.15 years of life expectancy per year to 2060", () => {
    expect(mortalityImprovementFactor("US", 2027)).toBe(1);
    expect(lifeExpectancyGain("US", 2045)).toBeCloseTo(2.7, 10);
    expect(lifeExpectancyGain("US", 2060)).toBeCloseTo(4.95, 10);
    expect(lifeExpectancyGain("US", 2090)).toBeCloseTo(4.95, 10);
    expect(mortalityImprovementFactor("JP", 2090)).toBe(mortalityImprovementFactor("JP", 2060));
    expect(mortalityImprovementFactor("CN", 2200)).toBeGreaterThanOrEqual(
      MORTALITY_IMPROVEMENT_FLOOR
    );
  });

  it("raises period life expectancy in 2045 above 2027 by about the central gain", () => {
    const health = healthcareMortalityModifier({});
    for (const sex of ["male", "female"] as const) {
      const le2027 = periodLifeExpectancy(sex, health * mortalityImprovementFactor("US", 2027));
      const le2045 = periodLifeExpectancy(sex, health * mortalityImprovementFactor("US", 2045));
      expect(le2045).toBeGreaterThan(le2027);
      // The infant floor and 100+ cap are not Gompertz shaped, so allow slack.
      expect(le2045 - le2027).toBeGreaterThan(2);
      expect(le2045 - le2027).toBeLessThan(3.2);
    }
  });

  it("leaves the healthcare modifier in play on top of the improvement", () => {
    const good = healthcareMortalityModifier({ lifeExpectancy: 85, preventableMortality: 120 });
    const bad = healthcareMortalityModifier({ lifeExpectancy: 70, preventableMortality: 500 });
    const f = mortalityImprovementFactor("DE", 2045);
    expect(periodLifeExpectancy("male", good * f)).toBeGreaterThan(
      periodLifeExpectancy("male", bad * f)
    );
  });
});

describe("cohort flows on the paths", () => {
  const TPY = 48;
  const vector = () =>
    synthesizeAgeSexVector({
      adultShares: { young: 25, mid: 27, mature: 30, senior: 18 },
      medianAge: 42,
      birthRate: 40,
      population: 1_000_000,
    });
  const legacy: CohortInputs = {
    replacementTFR: 2.06,
    birthRateIndex: 40,
    healthcare: {},
    netInternationalMigrants: 0,
    migrantShareMale: 0.5,
  };

  it("the same cohort loses fewer people in 2045 than in 2027", () => {
    const at = (year: number) =>
      advanceCohort(
        vector(),
        { ...legacy, mortalityImprovement: mortalityImprovementFactor("US", year) },
        1,
        TPY
      ).flows.deaths;
    expect(at(2045)).toBeLessThan(at(2027));
    expect(at(2027)).toBeCloseTo(advanceCohort(vector(), legacy, 1, TPY).flows.deaths, 6);
  });

  it("converts an annual path TFR to per-turn births exactly once", () => {
    const viaIndex = advanceCohort(vector(), legacy, 1, TPY).flows.births;
    const viaRate = advanceCohort(
      vector(),
      { ...legacy, fertilityRate: birthRateIndexToTFR(40, 2.06) },
      1,
      TPY
    ).flows.births;
    expect(viaRate).toBeCloseTo(viaIndex, 6);
    // Births are linear in the annual TFR: one conversion, no hidden rescaling.
    const half = advanceCohort(vector(), { ...legacy, fertilityRate: 0.8 }, 1, TPY).flows.births;
    const full = advanceCohort(vector(), { ...legacy, fertilityRate: 1.6 }, 1, TPY).flows.births;
    expect(full).toBeCloseTo(half * 2, 6);
  });

  it("other presets keep the replacement-anchored index", () => {
    const births = advanceCohort(vector(), legacy, 1, TPY).flows.births;
    const higherIndex = advanceCohort(vector(), { ...legacy, birthRateIndex: 50 }, 1, TPY).flows
      .births;
    expect(higherIndex).toBeGreaterThan(births);
    // With a path rate set, the index no longer drives births.
    const pinned = (index: number) =>
      advanceCohort(vector(), { ...legacy, birthRateIndex: index, fertilityRate: 1.5 }, 1, TPY)
        .flows.births;
    expect(pinned(20)).toBeCloseTo(pinned(80), 6);
  });
});
