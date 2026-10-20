/** Exhaustive numerical reachability audit. Synthetic counterfactuals, not live forecasts. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { COUNTRY_CONFIGS } from "../../src/lib/constants/countries";
import { primaryMetrics, primaryMetricById } from "../../src/lib/resetMetrics/catalog";
import { driftProxyValue } from "../../src/lib/resetMetrics/rules/policyDrift";
import { metricCountryCoverage } from "../../src/lib/resetMetrics/rules/metricContracts";
import {
  modeledReachability,
  modeledReachabilityIds,
  ownerReachability,
} from "../../src/lib/resetMetrics/testing/metricReachability";

const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
if (!out || !path.isAbsolute(out) || !path.relative(process.cwd(), out).startsWith(`..${path.sep}`))
  throw new Error("Provide absolute --out outside source");
const modeled = modeledReachability();
const fallbacks = modeledReachability(["04", "16", "18", "19", "24", "25", "41", "42"]);
const owners = Object.keys(COUNTRY_CONFIGS).map((country) => ({
  country,
  results: ownerReachability(country),
}));
for (const row of [...modeled, ...fallbacks]) {
  assert(row.families.length > 0, `${row.board}:${row.id} no existing law family`);
  assert(Number.isFinite(row.favorable) && Number.isFinite(row.adverse));
  assert(
    row.favorable !== row.opening || row.adverse !== row.opening,
    `${row.board}:${row.id}:${row.year} dead end`
  );
}
for (const country of owners) {
  assert.deepEqual(
    new Set([...modeledReachabilityIds, ...country.results.map((r) => r.id)]),
    new Set(primaryMetrics.map((m) => m.id))
  );
  for (const row of country.results)
    assert(
      row.before !== null &&
        row.after !== null &&
        Number.isFinite(row.before) &&
        Number.isFinite(row.after) &&
        row.before !== row.after,
      `${country.country}:${row.id} owner dead end`
    );
}
const trajectories = modeled
  .filter(
    (r) =>
      r.id === "32" &&
      (r.board === "UK:LON" || r.country === "JP" || r.country === "SCO" || r.country === "WAL")
  )
  .map((row) => {
    let sustained = row.opening,
      withdrawn = row.opening;
    const points = [];
    const countryId = row.country as "US" | "UK" | "JP" | "IE" | "SCO" | "WAL";
    for (let turn = 1; turn <= 144; turn++) {
      const input = {
        metric: primaryMetricById("32")!,
        openingValue: row.opening,
        countryId,
        year: row.year,
      };
      sustained = driftProxyValue({ ...input, currentValue: sustained, pressure: 0.5 });
      withdrawn = driftProxyValue({
        ...input,
        currentValue: withdrawn,
        pressure: turn <= 48 ? 0.5 : 0,
      });
      if ([1, 48, 96, 144].includes(turn)) points.push({ turn, sustained, withdrawn });
    }
    assert(sustained < withdrawn && withdrawn < row.opening);
    assert(Math.abs(sustained - row.favorable) < 0.001);
    return { board: row.board, year: row.year, opening: row.opening, points };
  });
const report = {
  verdict: "passed",
  scope:
    "All 58 IDs: 34 modeled targets across all four opening countries and two successor adapters, two eras and 144-turn equivalent constant-pressure trajectories; 24 owner-rule counterfactuals for every configured country. Does not certify legacy host integration or forecast live values.",
  countryCoverage: metricCountryCoverage(Object.keys(COUNTRY_CONFIGS)),
  modeled,
  fallbacks,
  owners,
  trajectories,
  guards: [
    "Missing sources remain unknown",
    "Election and cohort triggers preserved",
    "Physical bounds are not display-score bounds",
    "Legacy countries are not silently migrated",
  ],
};
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    verdict: report.verdict,
    modeled: modeled.length,
    ownerCases: owners.reduce((n, c) => n + c.results.length, 0),
    countries: owners.length,
  })
);
