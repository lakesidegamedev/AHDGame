/** Portable adapter/funding experiment. Synthetic fixtures are not country forecasts. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import {
  adaptHouseholdCountry,
  HOUSEHOLD_COUNTRY_PROFILES,
  type HouseholdCountryAdapterInput,
} from "../../src/lib/resetMetrics/rules/householdCountryAdapter";
import { householdAdapterFixture } from "../../src/lib/resetMetrics/testing/householdAdapterFixture";
import { householdPublication } from "../../src/lib/resetMetrics/rules/householdPublication";

const turns = 96;
const trajectories = [];
for (const country of ["US", "UK", "JP"] as const) {
  const base = householdAdapterFixture(country);
  for (const scenario of ["funded", "unfunded", "stale", "marginal", "missing-region"] as const) {
    const points = [];
    for (let turn = 2; turn <= turns + 1; turn++) {
      const fixture = structuredClone(base);
      fixture.turn = turn;
      fixture.coverage.measurementTurn = turn;
      fixture.coverage.reconciliation!.measurementTurn = turn;
      fixture.extract!.currentOwner!.measurementTurn = turn;
      const funded = scenario !== "unfunded";
      if (!funded) {
        fixture.extract!.rows = fixture.extract!.rows.map((r) => ({ ...r, paidCashTransfers: 0 }));
        fixture.coverage.reconciliation!.paidCashTransfers = 0;
      }
      if (scenario === "stale") fixture.extract!.currentOwner!.measurementTurn = 1;
      if (scenario === "marginal") fixture.extract!.distribution = "marginal-means";
      if (scenario === "missing-region") fixture.extract!.rows = fixture.extract!.rows.slice(3);
      const result = adaptHouseholdCountry(fixture);
      if (["stale", "marginal", "missing-region"].includes(scenario)) {
        assert.equal(result.path, "legacy");
        points.push({ turn, path: result.path, poverty: null });
        continue;
      }
      assert.equal(result.path, "prepared");
      if (result.path !== "prepared") throw new Error("Adapter did not prepare fixture");
      const program = {
        _id: "cash-law",
        country,
        scope: "national" as const,
        familyId: "L01",
        fundingAccountId: "test-account",
        effectiveTurn: 1,
        primaryMetricEffects: [],
      };
      const observations = householdPublication({
        worldId: fixture.worldId,
        countryId: country,
        turn,
        regionIds: fixture.coverage.regions.map((r) => r.regionId),
        source: result.source,
        programs: [program],
        settlements: new Map([
          [
            "cash-law",
            {
              implementationFactor: funded ? 1 : 0,
              outlaid: funded ? 2 : 0,
              lastSettledTurn: turn,
              paymentKey: `${country}:test-payment:${turn}`,
            },
          ],
        ]),
      });
      assert.equal(observations.size, fixture.coverage.regions.length);
      const poverty = observations.values().next().value!["03"]!.value;
      assert.equal(poverty, funded ? 0 : 25);
      points.push({ turn, path: result.path, poverty });
    }
    trajectories.push({ country, scenario, points });
  }
}

// Optional independently supplied normalized extracts exercise the exact same
// rules without persisting records or changing a configured database.
const inputsPath = process.argv.find((a) => a.startsWith("--inputs="))?.slice(9);
const supplied = inputsPath
  ? (JSON.parse(readFileSync(inputsPath, "utf8")) as HouseholdCountryAdapterInput[]).map(
      (input) => {
        const result = adaptHouseholdCountry(input);
        return { country: input.countryId, path: result.path, gaps: result.gaps };
      }
    )
  : [];
const report = {
  scope:
    "Synthetic adapter and actual-law settlement boundary experiment, not empirical country activation, migration, performance qualification or a full-world simulation.",
  turns,
  countries: 3,
  scenarios: 5,
  publicReferenceProfiles: HOUSEHOLD_COUNTRY_PROFILES,
  realCountryActivation:
    "None. Current regional household distributions and independent fiscal reconciliation are not yet qualified.",
  suppliedExtracts: supplied,
  trajectories,
};
const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
if (!out) throw new Error("Provide --out= with a diagnostic path outside the repository");
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ countries: 3, scenarios: 5, turns, suppliedExtracts: supplied }));
