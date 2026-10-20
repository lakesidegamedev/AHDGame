/** Controlled model experiments, never a live migration or empirical country forecast. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { modeledHouseholdFixture } from "../../src/lib/resetMetrics/testing/modeledHouseholdFixture";
import { modelHouseholdIncome } from "../../src/lib/resetMetrics/rules/modelHouseholdIncome";
import { produceHouseholdSource } from "../../src/lib/resetMetrics/rules/produceHouseholdSource";
import { householdPublication } from "../../src/lib/resetMetrics/rules/householdPublication";
import type { HouseholdDecodedReference } from "../../src/lib/resetMetrics/rules/householdSources";
import { householdReferenceGaps } from "../../src/lib/resetMetrics/rules/householdSources";
const option = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = option("out"),
  relative = out ? path.relative(process.cwd(), out) : "";
if (
  !out ||
  !path.isAbsolute(out) ||
  (!path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`))
)
  throw new Error("Provide an absolute --out= outside source");
const results: {
  country: string;
  scenario: string;
  poverty: number[];
  realIncome: number[];
  gini: number[];
}[] = [];
for (const country of ["US", "UK", "JP"] as const) {
  const baseline = modeledHouseholdFixture(country);
  for (const scenario of [
    "baseline",
    "growth",
    "recession",
    "inflation",
    "unfunded",
    "progressive-tax",
    "population",
    "missing-rate",
    "missing-reference",
  ]) {
    const poverty: number[] = [],
      realIncome: number[] = [],
      gini: number[] = [];
    for (let turn = 2; turn <= 97; turn++) {
      const f = structuredClone(baseline);
      f.turn = turn;
      f.year = 1991 + Math.floor((turn - 1) / 48);
      if (turn >= 25) {
        if (scenario === "growth")
          f.activity = f.activity.map((r) => ({ ...r, output: r.output * 2 }));
        if (scenario === "recession")
          f.activity = f.activity.map((r) => ({ ...r, output: r.output * 0.5 }));
        if (scenario === "inflation")
          f.activity = f.activity.map((r) => ({ ...r, costOfLiving: 200 }));
        if (scenario === "population")
          f.activity = f.activity.map((r) => ({ ...r, population: r.population * 2 }));
        if (scenario === "progressive-tax")
          Object.assign(f.nationalTaxes, {
            incomeTaxLow: 0,
            incomeTaxMiddle: 0,
            incomeTaxHigh: 40,
          });
        if (scenario === "missing-rate")
          f.activity = f.activity.map((r) => ({ ...r, regionalTaxes: undefined }));
        if (scenario === "missing-reference") f.reference.distribution = "marginal-means";
      }
      const paid = scenario === "unfunded" && turn >= 25 ? 0 : 2;
      const receipt = f.settlements.get("cash-law")!;
      receipt.lastSettledTurn = turn;
      receipt.paymentKey = `${country}:${turn}`;
      receipt.outlaid = paid;
      const modeled = modelHouseholdIncome(f);
      assert.deepEqual(modelHouseholdIncome(f), modeled);
      if (modeled.gaps.length) {
        assert(turn >= 25 && (scenario === "missing-rate" || scenario === "missing-reference"));
        continue;
      }
      const produced = produceHouseholdSource({ ...f, ...modeled });
      assert.equal(produced.path, "produced");
      assert.equal(produced.source!.coverage.reconciliation!.paidCashTransfers, paid * 48);
      const reading = householdPublication({ ...f, source: produced.source })
        .values()
        .next().value!;
      assert(reading);
      poverty.push(reading["03"]!.value!);
      realIncome.push(reading["02"]!.value!);
      gini.push(reading["04"]!.value!);
    }
    results.push({ country, scenario, poverty, realIncome, gini });
  }
  const last = (scenario: string) =>
    results.find((r) => r.country === country && r.scenario === scenario)!;
  assert.equal(last("baseline").poverty.at(-1), 0);
  assert.equal(last("unfunded").poverty.at(-1), 25);
  assert(last("growth").realIncome.at(-1)! > last("baseline").realIncome.at(-1)!);
  assert(last("recession").realIncome.at(-1)! < last("baseline").realIncome.at(-1)!);
  assert(last("progressive-tax").gini.at(-1)! < last("baseline").gini.at(-1)!);
  assert.equal(last("inflation").realIncome.at(-1), last("baseline").realIncome.at(-1));
}
const refFile = option("references");
const references: HouseholdDecodedReference[] = refFile
  ? JSON.parse(readFileSync(refFile, "utf8")).references
  : [];
const actualReferencePreflight = references.map((reference) => {
  const f = modeledHouseholdFixture(reference.countryId);
  const result = modelHouseholdIncome({ ...f, reference });
  assert(result.gaps.length > 0);
  return {
    country: reference.countryId,
    path: "legacy",
    gaps: result.gaps,
    sourceGaps: reference.gaps,
    blockingSourceGaps: householdReferenceGaps(reference, true),
  };
});
writeFileSync(
  out,
  JSON.stringify(
    {
      scope:
        "Synthetic complete-input model experiments, not empirical country forecasts or activation. Actual decoded sources remain incomplete.",
      turns: 96,
      countries: 3,
      scenarios: 9,
      results,
      actualReferencePreflight,
    },
    null,
    2
  )
);
console.log(JSON.stringify({ turns: 96, countries: 3, scenarios: 9, actualReferencePreflight }));
