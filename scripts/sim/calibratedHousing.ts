/** Controlled housing trajectories using production rules, not live forecasts or a world simulation. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { calibratedHousingFixture } from "../../src/lib/resetMetrics/testing/calibratedHousingFixture";
import {
  prepareCalibratedHousing,
  HOUSING_MODEL_ASSUMPTIONS,
  HOUSING_MODEL_SOURCES,
} from "../../src/lib/resetMetrics/rules/calibratedHousing";
import { housingPublication } from "../../src/lib/resetMetrics/rules/housingPublication";
import type { HousingState, HousingTurnInput } from "../../src/lib/resetMetrics/rules/housing";
import { openingMetricPrograms } from "../../src/lib/metricEngine/rules/povertyOpening";
import { buildOpeningLawBoards1991 } from "../../src/lib/resetLegislation/openingBoards1991";
import { resetLawFamilies } from "../../src/lib/resetLegislation/catalog";

const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
if (!out || !path.isAbsolute(out) || !path.relative(process.cwd(), out).startsWith(`..${path.sep}`))
  throw new Error("Provide absolute --out outside source");
const scenarios = [
  "funded",
  "unfunded",
  "withdrawal",
  "construction-shortage",
  "higher-income",
  "inflation",
  "missing-input",
  "regional-only",
] as const;
interface HousingPoint {
  turn: number;
  dwellings: number;
  unhoused: number;
  completed: number;
  burden: number;
  supplyGrowth: number;
}
const results: {
  country: "US" | "UK" | "JP";
  scenario: (typeof scenarios)[number];
  completedTurns: number;
  points: HousingPoint[];
}[] = [];
const inherited = openingMetricPrograms({
  worldId: "housing-experiment",
  boards: buildOpeningLawBoards1991("housing-experiment", 1),
  replacements: [],
  accounts: [],
  familyIds: resetLawFamilies.map((f) => f.id),
});
const openingQualification = [];
for (const country of ["US", "UK", "JP"] as const) {
  const f = calibratedHousingFixture(country);
  const programs = inherited.filter((p) => p.country === country);
  const settlements = new Map(
    programs.map((p) => [
      p._id,
      p.scope === "national"
        ? { lastSettledTurn: 2, implementationFactor: 1, outlaid: 0, paymentKey: `${p._id}:2` }
        : {
            lastSettledTurn: 2,
            implementationFactor: 1,
            fundedAnnualAmount: 0,
            fundingKey: `${p._id}:2`,
          },
    ])
  );
  const source = prepareCalibratedHousing({ ...f, programs, settlements, priorStates: new Map() });
  assert.deepEqual(source.gaps, []);
  openingQualification.push({
    country,
    programs: programs.length,
    housingPrograms: programs.filter((p) => ["L22", "L23", "L24"].includes(p.familyId)).length,
    qualified: true,
  });
  for (const scenario of scenarios) {
    let states = new Map<string, HousingState>();
    let completed = 0;
    const points: HousingPoint[] = [];
    for (let turn = 2; turn <= 145; turn++) {
      const f = calibratedHousingFixture(country, turn, {
        funding: scenario === "unfunded" || (scenario === "withdrawal" && turn >= 50) ? 0 : 1,
        ...(scenario === "construction-shortage" ? { crewDays: 0 } : {}),
        ...(scenario === "higher-income" && turn >= 50 ? { income: 1.2 } : {}),
        ...(scenario === "inflation" && turn >= 50 ? { prices: 1.2 } : {}),
        regional: scenario === "regional-only",
      });
      if (scenario === "missing-input") f.construction[0]!.turn = turn - 1;
      const prepared = prepareCalibratedHousing({ ...f, priorStates: states });
      if (scenario === "missing-input") {
        assert(!prepared.source);
        continue;
      }
      assert(prepared.source, `${country} ${scenario} ${turn}: ${prepared.gaps.join(",")}`);
      const readings = housingPublication({
        ...f,
        source: prepared.source,
        householdSource: f.households,
        priorStates: states,
      });
      assert.equal(
        readings.size,
        f.regionIds.length,
        `${country} ${scenario} ${turn}: publication`
      );
      const next = new Map([...readings].map(([id, row]) => [id, row.state]));
      for (const [id, row] of readings) {
        const flow: HousingTurnInput = prepared.source.regions.find((r) => r.regionId === id)!.flow;
        const state = row.state;
        const before: HousingState =
          states.get(id) ?? prepared.source.regions.find((r) => r.regionId === id)!.openingState;
        assert.equal(
          state.usableDwellings,
          before.usableDwellings + state.lastFlow!.completed - flow.dwellingsLost
        );
        assert.equal(
          state.constructionCash,
          before.constructionCash + flow.constructionCashReceived - state.lastFlow!.spent
        );
        assert(
          state.occupiedDwellings <= state.usableDwellings &&
            state.unhousedPeople <= flow.population
        );
        if (turn < 14 || scenario === "construction-shortage")
          assert.equal(state.lastFlow!.completed, 0);
        completed += state.lastFlow!.completed;
      }
      if ([2, 14, 49, 50, 97, 145].includes(turn)) {
        const retry = prepareCalibratedHousing({ ...f, priorStates: next });
        assert(retry.source);
        assert.deepEqual(
          housingPublication({
            ...f,
            source: retry.source,
            householdSource: f.households,
            priorStates: next,
          }),
          readings
        );
        const partial = new Map([
          [...next][0]!,
          ...[...states].filter(([id]) => id !== [...next][0]![0]),
        ]);
        const recovery = prepareCalibratedHousing({ ...f, priorStates: partial });
        assert.deepEqual(
          housingPublication({
            ...f,
            source: recovery.source,
            householdSource: f.households,
            priorStates: partial,
          }),
          readings
        );
      }
      states = next;
      const basis = readings.values().next().value!.updates;
      points.push({
        turn,
        dwellings: [...states.values()].reduce((n, s) => n + s.usableDwellings, 0),
        unhoused: [...states.values()].reduce((n, s) => n + s.unhousedPeople, 0),
        completed,
        burden: basis["24"]!.countryBasis!.value,
        supplyGrowth: basis["25"]!.countryBasis!.value,
      });
    }
    results.push({ country, scenario, completedTurns: 144, points });
  }
  const last = (scenario: (typeof scenarios)[number]) =>
    results.find((r) => r.country === country && r.scenario === scenario)!.points.at(-1)!;
  assert(last("funded").completed > last("unfunded").completed);
  assert(last("funded").burden < last("unfunded").burden);
  assert(last("higher-income").burden < last("funded").burden);
  assert.equal(last("construction-shortage").completed, 0);
}
writeFileSync(
  out,
  JSON.stringify(
    {
      question:
        "Do current funded housing laws and construction constraints produce conserved residential outcomes across complete US/UK/JP cohorts?",
      kind: "controlled-production-rules-experiment-not-live-forecast",
      turns: 144,
      scenarios,
      assumptions: HOUSING_MODEL_ASSUMPTIONS,
      sources: HOUSING_MODEL_SOURCES,
      openingQualification,
      results,
      verdict: "passed",
    },
    null,
    2
  )
);
console.log(
  JSON.stringify({
    out,
    verdict: "passed",
    countries: 3,
    scenarios: scenarios.length,
    turns: 144,
    openingQualification,
  })
);
