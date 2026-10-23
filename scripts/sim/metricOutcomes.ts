/** Ten-year controlled demographic/outcome experiment; not a full-world or live-country forecast. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { advanceCohort } from "../../src/lib/demographics/cohortFlows";
import { totalPopulation } from "../../src/lib/demographics/cohortVector";
import {
  calibratedMortalityRates,
  demographicRates,
} from "../../src/lib/resetMetrics/rules/demographicMeasurement";
import { fertilityPolicyIndex } from "../../src/lib/resetMetrics/rules/fertilityPolicy";
import { linkedOutcomeTargets } from "../../src/lib/resetMetrics/rules/linkedOutcomes";
import { ownedHealthAccess } from "../../src/lib/resetMetrics/rules/ownedHealthAccess";
import { householdDistributionRollup } from "../../src/lib/resetMetrics/rules/householdDistribution";
import { deliveredMetricEffects } from "../../src/lib/resetMetrics/rules/lawDelivery";
import { primaryMetricById } from "../../src/lib/resetMetrics/catalog";
import { resetMetricConditionScore } from "../../src/lib/resetMetrics/conditionScore";
import { policyDriftTarget, driftProxyValue } from "../../src/lib/resetMetrics/rules/policyDrift";
import { resetLawFamilyById } from "../../src/lib/resetLegislation/catalog";
import profiles from "../../src/lib/resetLegislation/provisionalBalanceProfiles.json";

export function simulateMetricOutcomes(horizon = 480) {
  assert(Number.isSafeInteger(horizon) && horizon >= 192);
  const rows: Array<{ country: string; scenario: string; points: Array<Record<string, number>> }> =
    [];
  for (const country of ["US", "UK", "JP", "IE", "SCO", "WAL"] as const) {
    const openingYears = { US: 75.4, UK: 75.9, JP: 79.4, IE: 75, SCO: 74, WAL: 75.7 }[country];
    for (const scenario of [
      "unchanged",
      "full",
      "half",
      "expired",
      "withdraw_after_96",
      "pandemic",
    ] as const) {
      const opening = {
        "02": 30000,
        "03": 20,
        "16": 90,
        "18": 20,
        "19": 250,
        "23": 60,
        "24": 100,
        "41": 20,
        "42": 10,
        "49": 50,
      };
      const regions = [1, 2].map((scale) => ({
        vector: {
          male: Array.from({ length: 101 }, (_, age) => scale * 10000 * Math.exp(-age / 50)),
          female: Array.from({ length: 101 }, (_, age) => scale * 10000 * Math.exp(-age / 55)),
        },
        index: 45,
        values: { ...opening },
      }));
      const points: Array<Record<string, number>> = [];
      for (let turn = 1; turn <= horizon; turn++) {
        const factor =
          scenario === "half"
            ? 0.5
            : ["unchanged", "pandemic"].includes(scenario) ||
                (scenario === "withdraw_after_96" && turn > 96)
              ? 0
              : 1;
        const programs = ["L38", "L19"].map((familyId) => ({
          _id: `existing-${familyId}`,
          country,
          scope: "national" as const,
          familyId,
          effectiveTurn: 1,
          fundingAccountId: "account",
          primaryMetricEffects: resetLawFamilyById(familyId)!.primaryMetricIds.map((metricId) => ({
            metricId,
            favorableNormalizedPoints: profiles.find((p) => p.familyId === familyId)!
              .primaryResponse[1]!,
          })),
        }));
        const pressure = deliveredMetricEffects(
          programs,
          new Map(
            programs.map((p) => [
              p._id,
              { implementationFactor: factor, lastSettledTurn: scenario === "expired" ? 0 : turn },
            ])
          ),
          turn
        );
        const flows = regions.map((region, i) => {
          region.index = fertilityPolicyIndex(45, region.index, pressure["55"] ?? 0);
          const policy = (id: keyof typeof opening) => ({
            metric: primaryMetricById(id)!,
            currentValue: region.values[id],
            openingValue: opening[id],
            pressure: pressure[id] ?? 0,
            countryId: country,
            year: 1991,
          });
          region.values["23"] = driftProxyValue(policy("23"));
          const access = ownedHealthAccess({
            coverageTarget: policyDriftTarget(policy("16"))!,
            delayTarget: policyDriftTarget(policy("18"))!,
            preparedness: region.values["23"],
            openingPreparedness: 60,
          })!;
          region.values["16"] += 0.02 * (access.coverage - region.values["16"]);
          region.values["18"] += 0.02 * (access.delay - region.values["18"]);
          const target = linkedOutcomeTargets({
            opening,
            current: region.values,
            policyTargets: {
              "19": policyDriftTarget(policy("19"))!,
              "24": policyDriftTarget(policy("24"))!,
              "41": policyDriftTarget(policy("41"))!,
              "42": policyDriftTarget(policy("42"))!,
            },
            conditionChanges: [
              ...Array<number>(9).fill(0),
              ...(["16", "19", "24"] as const).map(
                (id) =>
                  resetMetricConditionScore(
                    primaryMetricById(id)!,
                    region.values[id],
                    country,
                    1991
                  )! -
                  resetMetricConditionScore(primaryMetricById(id)!, opening[id], country, 1991)!
              ),
            ],
          });
          for (const [id, value] of Object.entries(target))
            region.values[id as keyof typeof opening] +=
              0.02 * (value - region.values[id as keyof typeof opening]);
          const before = totalPopulation(region.vector);
          const result = advanceCohort(
            region.vector,
            {
              replacementTFR: 2.06,
              birthRateIndex: region.index,
              healthcare: {},
              mortalityRates: calibratedMortalityRates({
                openingYears: openingYears + i,
                openingPreventable: 250,
                currentPreventable: region.values["19"],
              }),
              excessMortalityAnnual: scenario === "pandemic" && turn >= 49 && turn <= 96 ? 0.01 : 0,
              netInternationalMigrants: 0,
              migrantShareMale: 0.5,
            },
            turn,
            48
          );
          assert(
            Math.abs(
              totalPopulation(result.vector) - (before + result.flows.births - result.flows.deaths)
            ) < 1e-5
          );
          region.vector = result.vector;
          return result;
        });
        const tfr = demographicRates(flows.map((r) => r.fertility));
        const life = demographicRates(flows.map((r) => r.mortality));
        assert(tfr !== null && life !== null && tfr > 0 && life > 0 && life < 120);
        if ([1, 48, 72, 96, 192, horizon].includes(turn))
          points.push({
            turn,
            population: regions.reduce((n, r) => n + totalPopulation(r.vector), 0),
            tfr,
            life,
            trust: regions[0]!.values["49"],
            preventable: regions[0]!.values["19"],
          });
      }
      rows.push({ country, scenario, points });
    }
    const end = (scenario: string) =>
      rows.find((r) => r.country === country && r.scenario === scenario)!.points.at(-1)!;
    assert(end("full").tfr! > end("half").tfr! && end("half").tfr! > end("unchanged").tfr!);
    assert(end("full").life! > end("half").life! && end("half").life! > end("unchanged").life!);
    assert(Math.abs(end("expired").tfr! - end("unchanged").tfr!) < 1e-9);
    assert(Math.abs(end("expired").trust! - end("unchanged").trust!) < 1e-9);
    assert(end("withdraw_after_96").tfr! < end("half").tfr!);
    const pandemic = rows.find((r) => r.country === country && r.scenario === "pandemic")!.points;
    const normal = rows.find((r) => r.country === country && r.scenario === "unchanged")!.points;
    assert(pandemic.find((p) => p.turn === 72)!.life! < normal.find((p) => p.turn === 72)!.life!);
  }
  const pooled = householdDistributionRollup([
    { median: 20000, gini: 0, weight: 1000 },
    { median: 80000, gini: 0, weight: 1000 },
  ])!;
  assert(Math.abs(pooled.gini - 30) < 1e-6);
  return {
    scope:
      "Controlled production-rule cohort and linked-outcome trajectories, 6 countries, 2 regions each, 6 scenarios. No GDP, election or whole-world feedback. Not live forecasts.",
    horizon,
    rows,
    pooledIncomeExample: pooled,
  };
}

if (process.argv[1]?.endsWith("metricOutcomes.ts")) {
  const report = simulateMetricOutcomes();
  const out = process.argv.find((arg) => arg.startsWith("--out="))?.slice(6);
  if (out) writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      countries: 6,
      scenarios: 6,
      turns: report.horizon,
      pooledIncomeExample: report.pooledIncomeExample,
    })
  );
}
