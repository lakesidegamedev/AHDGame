/** Public-calibrated country cohorts under controlled economic/fiscal shocks, not live forecasts. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { BSON } from "mongodb";
import { COUNTRY_CONFIGS } from "../../src/lib/constants/countries";
import { openingHouseholdCalibration1991 } from "../../src/lib/resetMetrics/openingSeed1991";
import {
  prepareCalibratedHouseholds,
  COHORT_ASSUMPTIONS,
  COHORT_SOURCE_URLS,
} from "../../src/lib/resetMetrics/rules/calibratedHouseholdCohorts";
import { modelHouseholdIncome } from "../../src/lib/resetMetrics/rules/modelHouseholdIncome";
import { produceHouseholdSource } from "../../src/lib/resetMetrics/rules/produceHouseholdSource";
import { householdPublication } from "../../src/lib/resetMetrics/rules/householdPublication";
import { getInitialNationalBudgetsForPreset } from "../../src/lib/seeds/reference/budgets";
import { buildOpeningLawBoards1991 } from "../../src/lib/resetLegislation/openingBoards1991";
import { openingMetricPrograms } from "../../src/lib/metricEngine/rules/povertyOpening";
import { resetLawFamilies } from "../../src/lib/resetLegislation/catalog";
import type {
  MetricLawProgram,
  MetricLawSettlement,
} from "../../src/lib/resetMetrics/rules/lawDelivery";

const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
const relative = out ? path.relative(process.cwd(), out) : "";
if (
  !out ||
  !path.isAbsolute(out) ||
  (!path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`))
)
  throw Error("Provide absolute --out= outside source");
const budgets = getInitialNationalBudgetsForPreset("1991-default");
const inheritedPrograms = openingMetricPrograms({
  worldId: "calibration-experiment",
  boards: buildOpeningLawBoards1991("calibration-experiment", 1),
  replacements: [],
  accounts: [],
  familyIds: resetLawFamilies.map((f) => f.id),
});
const openingQualification = ["US", "UK", "JP"].map((countryId) => {
  const calibration = openingHouseholdCalibration1991(countryId);
  const programs = inheritedPrograms.filter((p) => p.country === countryId);
  const prepared = prepareCalibratedHouseholds({
    worldId: "calibration-experiment",
    countryId,
    preset: "1991-default",
    regionIds: calibration.map((r) => r.regionId),
    calibration,
    programs,
  });
  assert.deepEqual(prepared.gaps, []);
  return { countryId, programs: programs.length, gaps: prepared.gaps };
});
interface Point {
  turn: number;
  path: string;
  gaps?: readonly string[];
  income?: number;
  poverty?: number;
  gini?: number;
  annualBenefits?: number;
}
const results: {
  country: string;
  scenario: string;
  regions: number;
  cohorts: number;
  referenceAndModelBsonBytes: number;
  trajectory: Point[];
}[] = [];
for (const country of ["US", "UK", "JP"] as const) {
  const calibration = openingHouseholdCalibration1991(country);
  const regionIds = calibration.map((r) => r.regionId);
  const national = budgets.find((b) => b.countryId === country)!;
  const programs: MetricLawProgram[] = [
    ...["L01", "L02"].map((familyId) => ({
      _id: `${country}:${familyId}`,
      country,
      scope: "national" as const,
      familyId,
      choice: "center_left",
      effectiveTurn: 1,
      fundingAccountId: "account",
      primaryMetricEffects: [],
    })),
    {
      _id: `${country}:regional`,
      country,
      scope: "regional",
      regionId: regionIds[0],
      familyId: "L01",
      choice: "center_left",
      effectiveTurn: 1,
      fundingAccountId: "regional_budget",
      primaryMetricEffects: [],
    },
  ];
  const args = {
    worldId: "calibration-experiment",
    countryId: country,
    preset: "1991-default",
    calibration,
    regionIds,
    programs,
  };
  const pack = prepareCalibratedHouseholds(args);
  assert.deepEqual(pack.gaps, []);
  const bytes = BSON.calculateObjectSize({ reference: pack.reference, model: pack.model });
  assert(bytes < 16 * 1024 * 1024);
  for (const scenario of [
    "baseline",
    "growth",
    "recession",
    "inflation",
    "population",
    "unfunded",
    "progressive-tax",
    "missing-rate",
    "missing-levy",
    "unknown-law",
  ]) {
    const trajectory: Point[] = [];
    for (let turn = 2; turn <= 97; turn++) {
      const changed = turn >= 25;
      const growth =
        changed && scenario === "growth" ? 1.2 : changed && scenario === "recession" ? 0.8 : 1;
      const prices = changed && scenario === "inflation" ? 1.2 : 1;
      const population = changed && scenario === "population" ? 1.1 : 1;
      const funding = changed && scenario === "unfunded" ? 0 : 1;
      const nationalTaxes = {
        ...national.taxRates,
        ...(changed && scenario === "progressive-tax"
          ? { incomeTaxLow: 5, incomeTaxMiddle: 20, incomeTaxHigh: 45 }
          : {}),
      };
      const activity = calibration.map((r) => ({
        ...r,
        output: r.output * growth,
        population: r.population * population,
        costOfLiving: r.costOfLiving * prices,
        regionalTaxes:
          country === COUNTRY_CONFIGS.US.id
            ? changed && scenario === "missing-rate"
              ? undefined
              : { incomeTax: 5, propertyTax: 1 }
            : undefined,
        ...(country !== "US"
          ? {
              annualHouseholdLevy:
                changed && scenario === "missing-levy"
                  ? NaN
                  : r.population * r.medianIncome * 0.015,
            }
          : {}),
      }));
      const settlements = new Map<string, MetricLawSettlement>();
      const annual = calibration.reduce((s, r) => s + r.population * r.medianIncome, 0);
      for (const p of programs)
        settlements.set(
          p._id,
          p.scope === "national"
            ? {
                implementationFactor: 1,
                lastSettledTurn: turn,
                outlaid: Math.round(((annual * 0.02) / 48) * funding),
                paymentKey: `${p._id}:${turn}`,
              }
            : {
                implementationFactor: 1,
                lastSettledTurn: turn,
                validThroughTurn: turn + 1,
                fundedAnnualAmount:
                  calibration[0]!.population * calibration[0]!.medianIncome * 0.01 * funding,
                fundingKey: `${p._id}:${turn}`,
              }
        );
      const currentPrograms =
        changed && scenario === "unknown-law"
          ? [...programs, { ...programs[0]!, _id: "unknown", choice: "unreviewed" }]
          : programs;
      const currentPack =
        changed && scenario === "unknown-law"
          ? prepareCalibratedHouseholds({ ...args, programs: currentPrograms })
          : pack;
      const modeled: ReturnType<typeof modelHouseholdIncome> = currentPack.gaps.length
        ? { gaps: currentPack.gaps }
        : modelHouseholdIncome({
            ...args,
            ...currentPack,
            turn,
            year: 1991 + Math.floor((turn - 1) / 48),
            nationalTaxes,
            activity,
          });
      const produced = modeled.gaps.length
        ? undefined
        : produceHouseholdSource({
            ...args,
            reference: currentPack.reference,
            ...modeled,
            current: modeled.current,
            fiscalControls: modeled.fiscalControls,
            turn,
            year: 1991 + Math.floor((turn - 1) / 48),
            programs: currentPrograms,
            settlements,
          });
      const expectedLegacy =
        changed &&
        (scenario === "unknown-law" ||
          (scenario === "missing-rate" && country === "US") ||
          (scenario === "missing-levy" && country !== "US"));
      if (expectedLegacy) {
        assert(modeled.gaps.length || produced?.path === "legacy");
        trajectory.push({
          turn,
          path: "legacy",
          gaps: modeled.gaps.length ? modeled.gaps : produced!.gaps,
        });
        continue;
      }
      assert.deepEqual(modeled.gaps, []);
      assert.equal(
        produced!.path,
        "produced",
        JSON.stringify({ country, scenario, turn, gaps: produced!.gaps })
      );
      const observations = householdPublication({
        ...args,
        turn,
        source: produced!.source,
        programs: currentPrograms,
        settlements,
      });
      assert.equal(observations.size, regionIds.length);
      const first = observations.values().next().value!;
      const income = first["02"]!.countryBasis!.value,
        poverty = first["03"]!.countryBasis!.value,
        gini = first["04"]!.countryBasis!.value;
      assert(
        Number.isFinite(income) &&
          income > 0 &&
          poverty >= 0 &&
          poverty <= 100 &&
          gini >= 0 &&
          gini <= 100
      );
      assert.equal(first["03"]!.status, "proxy");
      if (funding === 0)
        assert.equal(produced!.source!.coverage.reconciliation!.paidCashTransfers, 0);
      trajectory.push({
        turn,
        path: "produced",
        income,
        poverty,
        gini,
        annualBenefits: produced!.source!.coverage.reconciliation!.paidCashTransfers,
      });
    }
    results.push({
      country,
      scenario,
      regions: regionIds.length,
      cohorts: pack.reference!.cells.length,
      referenceAndModelBsonBytes: bytes,
      trajectory,
    });
  }
  const last = (s: string) =>
    results.find((r) => r.country === country && r.scenario === s)!.trajectory.at(-1)!;
  assert(last("growth").income! > last("baseline").income!);
  assert(last("recession").income! < last("baseline").income!);
  assert(last("unfunded").income! < last("baseline").income!);
}
writeFileSync(
  out,
  JSON.stringify(
    {
      scope:
        "Public-data-calibrated 1991 country rosters with controlled paid national and funded regional benefit scenarios. Not live-world forecasts or independently measured household outcomes.",
      turns: 96,
      assumptions: COHORT_ASSUMPTIONS,
      sources: COHORT_SOURCE_URLS,
      openingQualification,
      results,
    },
    null,
    2
  )
);
console.log(
  JSON.stringify(
    results.map((r) => ({
      ...r,
      trajectory: undefined,
      first: r.trajectory[0],
      last: r.trajectory.at(-1),
    }))
  )
);
