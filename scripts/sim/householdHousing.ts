/** Controlled household and housing owner experiment, not real country forecasts or a full-world replay. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { COUNTRY_CONFIGS } from "../../src/lib/constants/countries";
import { housingFixture } from "../../src/lib/resetMetrics/testing/housingFixture";
import { householdPublication } from "../../src/lib/resetMetrics/rules/householdPublication";
import { housingPublication } from "../../src/lib/resetMetrics/rules/housingPublication";
import type { HousingState } from "../../src/lib/resetMetrics/rules/housing";
import type {
  MetricLawProgram,
  MetricLawSettlement,
} from "../../src/lib/resetMetrics/rules/lawDelivery";

const scenarios = [
  "funded",
  "unfunded",
  "half-funded",
  "material-shortage",
  "labor-shortage",
  "rent-shock",
  "funding-withdrawal",
  "tax-change",
  "incomplete",
] as const;
type Scenario = (typeof scenarios)[number];
interface Point {
  turn: number;
  legacy: boolean;
  poverty: number | null;
  gini: number | null;
  burden: number | null;
  dwellings: number;
  unhoused: number;
  cash: number;
  completed: number;
}

export function simulateHouseholdHousing(turns = 96) {
  assert(Number.isSafeInteger(turns) && turns >= 48);
  const results: { countryId: string; scenario: Scenario; points: Point[] }[] = [];
  const base = housingFixture();
  for (const countryId of Object.keys(COUNTRY_CONFIGS).sort()) {
    for (const scenario of scenarios) {
      const states = new Map<string, HousingState>();
      const points: Point[] = [];
      for (let turn = 2; turn <= turns + 1; turn++) {
        const household = structuredClone(base.source);
        household.coverage.countryId = countryId;
        household.coverage.measurementTurn = turn;
        household.coverage.currency = "synthetic-local";
        const factor =
          scenario === "unfunded" || (scenario === "funding-withdrawal" && turn > 24)
            ? 0
            : scenario === "half-funded"
              ? 0.5
              : 1;
        for (const row of household.inputs) {
          row.countryId = countryId;
          row.currency = "synthetic-local";
          row.measurementTurn = turn;
          for (const group of row.groups) {
            group.paidCashTransfers = group.id === "low" ? 48 * factor : 0;
            group.directTaxes =
              scenario === "tax-change"
                ? group.id === "high"
                  ? 60
                  : group.id === "middle"
                    ? 10
                    : 0
                : 0;
          }
        }
        const control = household.coverage.reconciliation!;
        control.countryId = countryId;
        control.currency = "synthetic-local";
        control.measurementTurn = turn;
        control.paidCashTransfers = 96 * factor;
        control.directTaxes = scenario === "tax-change" ? 160 : 0;
        if (scenario === "incomplete") household.coverage.references.composition = undefined;
        const housing = structuredClone(base.housing);
        housing.countryId = countryId;
        housing.currency = "synthetic-local";
        housing.measurementTurn = turn;
        housing.privateFinance.countryId = countryId;
        housing.privateFinance.currency = "synthetic-local";
        housing.privateFinance.turn = turn;
        for (const region of housing.regions) {
          region.openingState.countryId = countryId;
          region.openingState.occupiedDwellings = 100;
          region.flow.turn = turn;
          region.flow.constructionCashReceived = 100 * factor;
          if (scenario === "material-shortage") region.flow.materialCapacity = 1;
          if (scenario === "labor-shortage") region.flow.laborCapacity = 1;
          region.flow.newProjects =
            turn % 12 === 0
              ? [{ id: `project-${turn}`, dwellings: 30, earliestCompletionTurn: turn + 3 }]
              : [];
          for (const payment of region.payments) {
            payment.annualLandlordAssistance = payment.groupId === "low" ? 48 * factor : 0;
            if (scenario === "rent-shock") payment.annualPayments *= 2;
          }
        }
        const programs: MetricLawProgram[] = [
          ["cash-law", "L01"],
          ["capital-law", "L22"],
          ["assistance-law", "L23"],
        ].map(([id, familyId]) => ({
          _id: id!,
          familyId: familyId!,
          country: countryId,
          scope: "national",
          fundingAccountId: "fixture",
          effectiveTurn: 1,
          primaryMetricEffects: [],
        }));
        const settlements = new Map<string, MetricLawSettlement>(
          programs.map((p) => [
            p._id,
            {
              implementationFactor: factor,
              lastSettledTurn: turn,
              paymentKey: `${p._id}:${turn}`,
              outlaid: (p._id === "capital-law" ? 200 : 2) * factor,
            },
          ])
        );
        const regionIds = household.inputs.map((r) => r.regionId);
        const currentHouseholds = householdPublication({
          worldId: "test-world",
          countryId,
          turn,
          regionIds,
          source: household,
          programs,
          settlements,
        });
        const currentHousing = housingPublication({
          worldId: "test-world",
          countryId,
          turn,
          regionIds,
          source: housing,
          householdSource: household,
          householdReadings: currentHouseholds,
          priorStates: states,
          programs,
          settlements,
        });
        if (scenario === "incomplete") {
          assert.equal(currentHouseholds.size, 0);
          assert.equal(currentHousing.size, 0);
          assert.equal(states.size, 0);
        } else {
          assert.equal(currentHousing.size, 2);
          for (const [regionId, resolution] of currentHousing) {
            const before =
              states.get(regionId) ??
              housing.regions.find((r) => r.regionId === regionId)!.openingState;
            const after = resolution.state,
              flow = after.lastFlow!;
            assert.equal(
              after.usableDwellings,
              before.usableDwellings + flow.completed - flow.lost
            );
            assert.equal(
              after.constructionCash + flow.spent,
              before.constructionCash +
                housing.regions.find((r) => r.regionId === regionId)!.flow.constructionCashReceived
            );
            assert(after.occupiedDwellings <= after.usableDwellings);
            assert(after.unhousedPeople >= 0);
            states.set(regionId, after);
          }
          const retried = housingPublication({
            worldId: "test-world",
            countryId,
            turn,
            regionIds,
            source: housing,
            householdSource: household,
            householdReadings: currentHouseholds,
            priorStates: states,
            programs,
            settlements,
          });
          assert.deepEqual(retried, currentHousing);
        }
        if (turn === 2 || turn === 24 || turn === 25 || turn % 12 === 0 || turn === turns + 1) {
          const hh = currentHouseholds.values().next().value;
          const home = currentHousing.values().next().value;
          points.push({
            turn,
            legacy: scenario === "incomplete",
            poverty: hh?.["03"]?.countryBasis?.value ?? null,
            gini: hh?.["04"]?.countryBasis?.value ?? null,
            burden: home?.updates["24"]?.countryBasis?.value ?? null,
            dwellings: [...states.values()].reduce((s, r) => s + r.usableDwellings, 0),
            unhoused: [...states.values()].reduce((s, r) => s + r.unhousedPeople, 0),
            cash: [...states.values()].reduce((s, r) => s + r.constructionCash, 0),
            completed: [...states.values()].reduce((s, r) => s + r.lastFlow!.completed, 0),
          });
        }
      }
      results.push({ countryId, scenario, points });
    }
  }
  for (const country of Object.keys(COUNTRY_CONFIGS)) {
    const last = (scenario: Scenario) =>
      results.find((r) => r.countryId === country && r.scenario === scenario)!.points.at(-1)!;
    assert(last("funded").poverty! < last("unfunded").poverty!);
    assert(last("funded").burden! < last("unfunded").burden!);
    assert(last("funded").unhoused < last("unfunded").unhoused);
    assert(last("material-shortage").dwellings < last("funded").dwellings);
    assert(last("labor-shortage").dwellings < last("funded").dwellings);
    assert(last("rent-shock").burden! > last("funded").burden!);
    assert(last("tax-change").gini! < last("funded").gini!);
    const withdrawal = results.find(
      (r) => r.countryId === country && r.scenario === "funding-withdrawal"
    )!;
    assert(
      withdrawal.points.at(-1)!.dwellings >= withdrawal.points.find((p) => p.turn === 24)!.dwellings
    );
  }
  return {
    scope:
      "Controlled portable owner experiment using identical synthetic fixtures in every country. Not country-adapter qualification, empirical calibration, live migration or full-world simulation.",
    turns,
    countries: Object.keys(COUNTRY_CONFIGS).length,
    scenarios,
    results,
  };
}

const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
if (out) {
  const report = simulateHouseholdHousing();
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      countries: report.countries,
      scenarios: report.scenarios.length,
      turns: report.turns,
    })
  );
}
