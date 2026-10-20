/** Controlled metric-driver trajectories using production rules, not live forecasts or a world replay. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildOpeningMetricSnapshots1991 } from "../../src/lib/resetMetrics/seedOpening1991";
import { gameplayMetricPressure } from "../../src/lib/resetMetrics/rules/gameplayDrivers";
import { driftProxyValue } from "../../src/lib/resetMetrics/rules/policyDrift";
import { primaryMetricById } from "../../src/lib/resetMetrics/catalog";
import {
  advanceProductivity,
  productivityBasis,
  productivityGrowth,
  outputGrowth,
  type ProductivityState,
} from "../../src/lib/resetMetrics/rules/productivity";
import { openingMetricPrograms } from "../../src/lib/metricEngine/rules/povertyOpening";
import { buildOpeningLawBoards1991 } from "../../src/lib/resetLegislation/openingBoards1991";
import {
  deliveredMetricEffects,
  metricLawApplies,
} from "../../src/lib/resetMetrics/rules/lawDelivery";
import { resetLawFamilies } from "../../src/lib/resetLegislation/catalog";
import { marketServicePressure } from "../../src/lib/resetMetrics/rules/marketServices";

const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
if (!out || !path.isAbsolute(out) || !path.relative(process.cwd(), out).startsWith(`..${path.sep}`))
  throw new Error("Provide absolute --out outside source");
const scenarios = [
  "baseline",
  "jobs-recovery",
  "recession",
  "funded-services",
  "defunded-services",
  "withdrawal",
  "delivery-shortage",
] as const;
const models = [
  "11",
  "12",
  "13",
  "14",
  "15",
  "17",
  "21",
  "22",
  "23",
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
  "32",
  "34",
  "35",
  "36",
  "37",
  "38",
  "39",
  "40",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "50",
  "52",
  "53",
];
const openings = buildOpeningMetricSnapshots1991("gameplay-sim", 1);
const inherited = openingMetricPrograms({
  worldId: "gameplay-sim",
  boards: buildOpeningLawBoards1991("gameplay-sim", 1),
  replacements: [],
  accounts: [],
  familyIds: resetLawFamilies.map((f) => f.id),
});
const results: {
  country: "US" | "UK" | "JP";
  scenario: (typeof scenarios)[number];
  regions: number;
  checkpoints: { turn: number; meanValues: Record<string, number> }[];
}[] = [];
for (const country of ["US", "UK", "JP"] as const)
  for (const scenario of scenarios) {
    const boards = structuredClone(
      openings.filter((b) => b.countryId === country && b.scope === "regional")
    );
    const output = new Map<string, ProductivityState>();
    const checkpoints = [];
    for (let turn = 1; turn <= 145; turn++) {
      for (const board of boards) {
        const recovery = scenario === "jobs-recovery",
          recession = scenario === "recession";
        const factor = recession ? 0.95 : recovery ? 1.05 : 1.02;
        const jobs = recession ? 0.98 : recovery ? 1.02 : 1.01;
        const state = advanceProductivity({
          previous: output.get(board._id),
          turn,
          countryId: country,
          output: 1000 * factor ** ((turn - 1) / 48),
          employed: 100 * jobs ** ((turn - 1) / 48),
          employmentTurn: turn,
        });
        output.set(board._id, state);
        assert(state.points.length <= 49);
        if (turn === 1) continue;
        // Controlled upstream changes stand in for already-owned labor/household
        // systems. Their accounting is tested by the separate cohort and housing sims.
        for (const id of ["01", "03"])
          board.observations[id]!.value =
            board.openingValues![id]! * (recovery ? 0.5 : recession ? 1.3 : 1);
        board.observations["02"]!.value =
          board.openingValues!["02"]! * (recovery ? 1.2 : recession ? 0.85 : 1);
        const programs = inherited.filter((p) => metricLawApplies(p, board));
        const funded =
          scenario !== "defunded-services" && !(scenario === "withdrawal" && turn >= 73);
        const settlements = new Map(
          programs.map((p) => [
            p._id,
            { lastSettledTurn: turn, implementationFactor: funded ? 1 : 0 },
          ])
        );
        const pressure = deliveredMetricEffects(programs, settlements, turn);
        const reference = deliveredMetricEffects(
          programs,
          new Map(programs.map((p) => [p._id, { lastSettledTurn: turn, implementationFactor: 1 }])),
          turn
        );
        for (const id of Object.keys(reference))
          pressure[id] = (pressure[id] ?? 0) - reference[id]!;
        // A controlled extra delivered service input tests reversibility without
        // inventing an appropriation or touching any live fiscal ledger.
        if (scenario === "funded-services" || (scenario === "withdrawal" && turn < 73))
          pressure["26"] = (pressure["26"] ?? 0) + 0.4;
        for (const [id, p] of Object.entries(gameplayMetricPressure(board, 1991)))
          pressure[id] = (pressure[id] ?? 0) + p;
        if (scenario === "delivery-shortage")
          for (const [id, p] of Object.entries(
            marketServicePressure(
              ["healthcare_services", "energy", "food"].map((commodity) => ({
                commodity,
                turn,
                stateDemand: { [board.regionId!]: 100 },
                stateDeliveredSupply: { [board.regionId!]: 50 },
              })),
              [board.regionId!],
              turn,
              false
            )
          ))
            pressure[id] = (pressure[id] ?? 0) + p;
        const prior = structuredClone(board.observations);
        for (const id of models) {
          // Education, recidivism and mobility remain reporting-point estimates.
          if (primaryMetricById(id)!.refresh === "cohort" && turn % 48 !== 0) continue;
          const value = driftProxyValue({
            metric: primaryMetricById(id)!,
            currentValue: prior[id]!.value!,
            openingValue: board.openingValues![id]!,
            pressure: Math.max(-1.2, Math.min(1.2, pressure[id] ?? 0)),
            countryId: country,
            year: 1991,
          });
          assert(Number.isFinite(value));
          board.observations[id] = { ...prior[id]!, value, status: "proxy" };
        }
        const basis = productivityBasis(state);
        if (turn < 49) assert.equal(basis, null);
        if (basis) {
          assert(Math.abs(productivityGrowth([basis])! - 100 * (factor / jobs - 1)) < 1e-8);
          assert(Math.abs(outputGrowth([basis])! - 100 * (factor - 1)) < 1e-8);
        }
      }
      if ([48, 49, 72, 96, 145].includes(turn))
        checkpoints.push({
          turn,
          meanValues: Object.fromEntries(
            models.map((id) => [
              id,
              boards.reduce((n, b) => n + b.observations[id]!.value!, 0) / boards.length,
            ])
          ),
        });
    }
    results.push({ country, scenario, regions: boards.length, checkpoints });
  }
for (const country of ["US", "UK", "JP"]) {
  const final = (scenario: string, id: string) =>
    results.find((r) => r.country === country && r.scenario === scenario)!.checkpoints.at(-1)!
      .meanValues[id]!;
  assert(final("jobs-recovery", "31") < final("recession", "31"));
  assert(final("funded-services", "26") > final("withdrawal", "26"));
  assert(final("withdrawal", "26") > final("defunded-services", "26"));
  assert(final("delivery-shortage", "30") < final("baseline", "30"));
}
writeFileSync(
  out,
  JSON.stringify(
    {
      scope:
        "Controlled 144-turn production-rule experiments across all US/UK/JP seed regions, not a live forecast or full-world replay",
      verdict: "passed",
      assumptions:
        "Bounded lagged game elasticities; fixed modeled hours; current existing-law delivery, with a controlled extra roads-service input",
      results,
    },
    null,
    2
  )
);
console.log(JSON.stringify({ verdict: "passed", cases: results.length, turns: 144 }));
