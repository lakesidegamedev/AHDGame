/** Real-reference preflight plus controlled current-owner counterfactuals, never a live migration. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { householdProducerFixture } from "../../src/lib/resetMetrics/testing/householdProducerFixture";
import { produceHouseholdSource } from "../../src/lib/resetMetrics/rules/produceHouseholdSource";
import { householdPublication } from "../../src/lib/resetMetrics/rules/householdPublication";
import type { HouseholdDecodedReference } from "../../src/lib/resetMetrics/rules/householdSources";

const option = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = option("out");
const outputRelative = out ? path.relative(process.cwd(), out) : "";
if (
  !out ||
  !path.isAbsolute(out) ||
  (!path.isAbsolute(outputRelative) && !outputRelative.startsWith(`..${path.sep}`))
)
  throw new Error("Provide --out= with an absolute diagnostic path outside the repository");
interface SimulationPoint {
  turn: number;
  path: "produced" | "legacy";
  poverty: number | null;
  income: number | null;
  gini: number | null;
}
const turns = 96,
  results: { country: string; scenario: string; points: SimulationPoint[] }[] = [];
for (const country of ["US", "UK", "JP"] as const) {
  const base = householdProducerFixture(country);
  for (const scenario of [
    "funded",
    "unfunded",
    "half-funded",
    "withdrawal",
    "progressive-tax",
    "price-shock",
    "forecast-control",
    "missing-current-owner",
  ] as const) {
    const points = [];
    for (let turn = 2; turn <= turns + 1; turn++) {
      const f = structuredClone(base);
      f.turn = turn;
      f.year = 1991 + Math.floor((turn - 1) / 48);
      f.current.turn = turn;
      f.current.year = f.year;
      f.fiscalControls.turn = turn;
      const paid =
        scenario === "unfunded" || (scenario === "withdrawal" && turn > 24)
          ? 0
          : scenario === "half-funded"
            ? 1
            : 2;
      f.settlements.get("cash-law")!.lastSettledTurn = turn;
      f.settlements.get("cash-law")!.paymentKey = `${country}:paid:${turn}`;
      f.settlements.get("cash-law")!.outlaid = paid;
      if (scenario === "progressive-tax") {
        f.current.cells = f.current.cells.map((c) => ({
          ...c,
          directTaxes: c.id === "high" ? 80 : 0,
        }));
        f.fiscalControls.annualDirectTaxes = 160;
      }
      if (scenario === "price-shock")
        f.current.regions = f.current.regions.map((r) => ({ ...r, consumerPriceIndex: 200 }));
      if (scenario === "forecast-control") f.fiscalControls.basis = "budget-forecast";
      const result = produceHouseholdSource({
        ...f,
        current: scenario === "missing-current-owner" ? undefined : f.current,
      });
      assert.deepEqual(
        produceHouseholdSource({
          ...f,
          current: scenario === "missing-current-owner" ? undefined : f.current,
        }),
        result
      );
      if (scenario === "forecast-control" || scenario === "missing-current-owner") {
        assert.equal(result.path, "legacy");
        points.push({ turn, path: result.path, poverty: null, income: null, gini: null });
        continue;
      }
      assert.equal(result.path, "produced");
      const readings = householdPublication({
        worldId: f.worldId,
        countryId: country,
        turn,
        regionIds: f.regionIds,
        source: result.source,
        programs: f.programs,
        settlements: f.settlements,
      });
      assert.equal(readings.size, f.regionIds.length);
      const current = readings.values().next().value!;
      assert.equal(result.source!.coverage.reconciliation!.paidCashTransfers, paid * 48);
      if (scenario === "unfunded" || (scenario === "withdrawal" && turn > 24))
        assert.equal(current["03"]!.value, 25);
      points.push({
        turn,
        path: result.path,
        poverty: current["03"]!.value,
        income: current["02"]!.value,
        gini: current["04"]!.value,
      });
    }
    results.push({ country, scenario, points });
  }
  const last = (scenario: string) =>
    results.find((r) => r.country === country && r.scenario === scenario)!.points.at(-1)!;
  assert(last("funded").poverty! < last("unfunded").poverty!);
  assert(last("progressive-tax").gini! < last("funded").gini!);
  assert.equal(last("price-shock").income, last("funded").income! / 2);
}
const referencesPath = option("references");
const realReferences: HouseholdDecodedReference[] = referencesPath
  ? JSON.parse(readFileSync(referencesPath, "utf8")).references
  : [];
const preflight = realReferences.map((reference) => {
  const f = householdProducerFixture(reference.countryId);
  const result = produceHouseholdSource({
    ...f,
    reference,
    current: undefined,
    fiscalControls: undefined,
  });
  assert.equal(result.path, "legacy");
  return {
    countryId: reference.countryId,
    cells: reference.cells.length,
    sourceAreas: new Set(reference.cells.map((c) => c.sourceArea)).size,
    path: result.path,
    gaps: result.gaps,
  };
});
const report = {
  scope:
    "Controlled synthetic current economic/fiscal owner experiments with existing cash-law identities, plus actual decoded reference preflight. Not empirical country forecasts, a full-world replay or live activation.",
  turns,
  countries: 3,
  scenarios: 8,
  preflight,
  results,
};
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ turns, countries: 3, scenarios: 8, preflight }));
