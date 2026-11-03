import { describe, expect, it } from "vitest";
import { advanceCohort } from "@/lib/demographics/cohortFlows";
import { totalPopulation } from "@/lib/demographics/cohortVector";
import { birthRateIndexToTFR } from "@/lib/demographics/flows/fertility";
import {
  calibratedMortalityRates,
  demographicRates,
  fertilityBasis,
  lifeFromMortalityRates,
} from "./demographicMeasurement";
import { fertilityPolicyIndex, FERTILITY_POLICY_MAX_BOOST } from "./fertilityPolicy";
import { householdDistributionRollup } from "./householdDistribution";
import { linkedOutcomeTargets } from "./linkedOutcomes";
import { ownedHealthAccess } from "./ownedHealthAccess";
import {
  aggregateNationalMetricValue,
  aggregateNationalMetricHistory,
} from "./nationalAggregation";
import { primaryMetricById } from "../catalog";
import type { OpeningMetricObservation } from "./openingObservation";

const vector = (size = 1000) => ({
  male: Array<number>(101).fill(size),
  female: Array<number>(101).fill(size),
});
const rates = calibratedMortalityRates({
  openingYears: 76,
  openingPreventable: 250,
  currentPreventable: 250,
});
function observation(
  id: string,
  value: number,
  extra: Partial<OpeningMetricObservation> = {}
): OpeningMetricObservation {
  const metric = primaryMetricById(id)!;
  return {
    metricId: id,
    path: metric.path,
    owner: metric.owner,
    value,
    status: "derived",
    source: "test",
    note: "test",
    ...extra,
  };
}

describe("age-specific demographic measurement", () => {
  it("uses central death rates consistently, including the open terminal interval", () => {
    expect(
      lifeFromMortalityRates({ male: Array(101).fill(0.02), female: Array(101).fill(0.02) })
    ).toBeCloseTo(50, 8);
  });
  it.each([68, 74, 80, 85])(
    "fits a %i-year life table without additive display years",
    (openingYears) => {
      expect(
        lifeFromMortalityRates(
          calibratedMortalityRates({
            openingYears,
            openingPreventable: 250,
            currentPreventable: 250,
          })
        )
      ).toBeCloseTo(openingYears, 8);
    }
  );
  it("reconciles measured births/deaths with the actual cohort flow, including excess mortality", () => {
    const before = vector();
    const result = advanceCohort(
      before,
      {
        replacementTFR: 2.06,
        birthRateIndex: 50,
        healthcare: {},
        mortalityRates: rates,
        excessMortalityAnnual: 0.01,
        migrantShareMale: 0.5,
        netInternationalMigrants: 0,
      },
      2,
      48
    );
    expect(result.fertility.births.reduce((a, b) => a + b, 0) / 48).toBeCloseTo(
      result.flows.births,
      8
    );
    expect(
      [...result.mortality.maleDeaths, ...result.mortality.femaleDeaths].reduce(
        (a, b) => a + b,
        0
      ) / 48
    ).toBeCloseTo(result.flows.deaths, 8);
    expect(totalPopulation(result.vector)).toBeCloseTo(
      totalPopulation(before) + result.flows.births - result.flows.deaths,
      7
    );
    expect(demographicRates([result.mortality])).toBeLessThan(76);
    expect(demographicRates([result.fertility])).toBeCloseTo(2.06, 8);
  });
  it("accounts for the ages of serving women, not just a scalar weighted birth ratio", () => {
    const before = vector();
    before.female[28] = 10000;
    const serving = Array<number>(101).fill(0);
    serving[28] = 10000;
    expect(demographicRates([fertilityBasis(before, 2, serving)])).toBeLessThan(2);
    const a = fertilityBasis(before, 2, serving),
      b = fertilityBasis(vector(10000), 1);
    const pooled = demographicRates([a, b])!;
    expect(pooled).not.toBeCloseTo((demographicRates([a])! + demographicRates([b])!) / 2, 3);
  });
  it("recomputes national life tables and future history from pooled age exposures", () => {
    const results = [vector(), vector(10000)].map((v, i) =>
      advanceCohort(
        v,
        {
          replacementTFR: 2.06,
          birthRateIndex: 50,
          healthcare: {},
          mortalityRates: calibratedMortalityRates({
            openingYears: 70 + 12 * i,
            openingPreventable: 250,
            currentPreventable: 250,
          }),
          migrantShareMale: 0.5,
          netInternationalMigrants: 0,
        },
        2,
        48
      )
    );
    const regions = results.map((r, i) => ({
      regionId: String(i),
      population: 1,
      observations: {
        "20": observation("20", demographicRates([r.mortality])!, {
          demographicBasis: r.mortality,
        }),
      },
      history: {
        "20": [
          { turn: 13, value: demographicRates([r.mortality])!, demographicBasis: r.mortality },
        ],
      },
    }));
    const expected = demographicRates(results.map((r) => r.mortality))!;
    expect(aggregateNationalMetricValue("20", regions)).toBeCloseTo(expected, 8);
    expect(expected).not.toBeCloseTo(76, 1);
    expect(aggregateNationalMetricHistory("20", regions)).toEqual([{ turn: 13, value: expected }]);
    const missing = structuredClone(results[0]!.mortality);
    missing.maleExposure[0] = 0;
    missing.maleDeaths[0] = 0;
    expect(demographicRates([missing])).toBeNull();
  });
  it("uses prior policy inputs, allowing expiry without feeding back service-constrained births", () => {
    const improved = fertilityPolicyIndex(40, 40, 0.8);
    expect(improved).toBeGreaterThan(40);
    expect(fertilityPolicyIndex(40, improved, 0)).toBeLessThan(improved);
    expect(fertilityPolicyIndex(40, undefined, 0)).toBe(40);
    let index = 45;
    for (let turn = 0; turn < 1000; turn++) index = fertilityPolicyIndex(45, index, 100);
    expect(birthRateIndexToTFR(index, 2.06) - birthRateIndexToTFR(45, 2.06)).toBeLessThanOrEqual(
      FERTILITY_POLICY_MAX_BOOST + 0.000001
    );
  });
});

describe("national household distribution estimates", () => {
  it("uses the same pooled distribution for board values and sampled history", () => {
    const regions = [20000, 80000].map((median, i) => {
      const householdBasis = { median, gini: 0, weight: 1000 };
      return {
        regionId: String(i),
        population: 1000,
        observations: {
          "02": observation("02", median, { householdBasis }),
          "04": observation("04", 0, { householdBasis }),
        },
        history: {
          "02": [{ turn: 13, value: median, householdBasis }],
          "04": [{ turn: 13, value: 0, householdBasis }],
        },
      };
    });
    expect(aggregateNationalMetricValue("02", regions)).toBeCloseTo(50000, 5);
    expect(aggregateNationalMetricValue("04", regions)).toBeCloseTo(30, 6);
    expect(aggregateNationalMetricHistory("04", regions)[0]!.value).toBeCloseTo(30, 6);
  });
  it("uses beginning population for growth, including negative regional flows", () => {
    const regions = [
      {
        regionId: "A",
        population: 200,
        observations: {
          "54": observation("54", 100, { ratioBasis: { numerator: 100, denominator: 100 } }),
        },
      },
      {
        regionId: "B",
        population: 900,
        observations: {
          "54": observation("54", -10, { ratioBasis: { numerator: -100, denominator: 1000 } }),
        },
      },
    ];
    expect(aggregateNationalMetricValue("54", regions)).toBe(0);
  });
  it("preserves a region's own median and Gini in the fitted discrete model", () => {
    const result = householdDistributionRollup([{ median: 30000, gini: 37, weight: 1000 }])!;
    expect(result.median).toBeCloseTo(30000, 6);
    expect(result.gini).toBeCloseTo(37, 6);
  });
  it("includes between-region inequality and is invariant to currency units and region partitioning", () => {
    const rows = [
      { median: 20000, gini: 0, weight: 1000 },
      { median: 80000, gini: 0, weight: 1000 },
    ];
    const result = householdDistributionRollup(rows)!;
    expect(result.gini).toBeCloseTo(30, 6);
    const scaled = householdDistributionRollup(
      rows.map((r) => ({ ...r, median: r.median * 100 }))
    )!;
    expect(scaled.gini).toBeCloseTo(result.gini, 6);
    expect(scaled.median).toBeCloseTo(result.median * 100, 5);
    expect(
      householdDistributionRollup(
        rows.flatMap((r) => [
          { ...r, weight: 500 },
          { ...r, weight: 500 },
        ])
      )!.gini
    ).toBeCloseTo(result.gini, 6);
  });
  it("does not invent a missing distribution", () => {
    expect(householdDistributionRollup([{ median: 0, gini: 40, weight: 100 }])).toBeNull();
  });
});

describe("linked funded outcome estimates", () => {
  const opening = {
    "02": 30000,
    "03": 20,
    "16": 90,
    "18": 20,
    "19": 250,
    "24": 100,
    "41": 20,
    "42": 10,
    "49": 50,
  };
  const policyTargets = { "19": 250, "24": 100, "41": 20, "42": 10 };
  it("holds the unchanged opening and moves in the intended directions", () => {
    const base = linkedOutcomeTargets({
      opening,
      current: opening,
      policyTargets,
      conditionChanges: [0],
    });
    expect(base).toEqual({ ...policyTargets, "49": 50 });
    const improved = linkedOutcomeTargets({
      opening,
      current: { ...opening, "02": 40000, "03": 10, "16": 95, "18": 10 },
      policyTargets,
      conditionChanges: [10, 20],
    });
    for (const id of ["19", "24", "41", "42"]) expect(improved[id]).toBeLessThan(base[id]!);
    expect(improved["49"]).toBe(65);
  });
  it("has no direct law-to-trust path and remains bounded under extreme conditions", () => {
    const result = linkedOutcomeTargets({
      opening,
      current: { ...opening, "02": 0, "03": 100 },
      policyTargets,
      conditionChanges: [200],
    });
    expect(result["49"]).toBe(100);
    expect(result["42"]).toBeLessThanOrEqual(100);
    expect(Object.values(result).every(Number.isFinite)).toBe(true);
  });
  it("makes care access responsive without consulting an unrelated political score", () => {
    const base = { coverageTarget: 90, delayTarget: 20, preparedness: 50, openingPreparedness: 50 };
    expect(ownedHealthAccess(base)).toEqual({ coverage: 90, delay: 20 });
    expect(ownedHealthAccess({ ...base, preparedness: 80 })!.coverage).toBeGreaterThan(90);
    expect(ownedHealthAccess({ ...base, preparedness: 80 })!.delay).toBeLessThan(20);
  });
});
