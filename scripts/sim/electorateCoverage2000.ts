/**
 * Deterministic electorate coverage qualification for #5101. No database,
 * player state, clock or random input. Run before/after on the same 1999 reset
 * with year 2000; reports stay outside the repository.
 * npx tsx scripts/sim/electorateCoverage2000.ts <report.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getBucketProfileForRegion } from "@/lib/demographics/bucketProfile";
import {
  deriveGranularElectorateUnits,
  clearGranularElectorateCache,
} from "@/lib/demographics/granularElectorate";
import { getCountryLayer1Model } from "@/lib/seeds/international";
import { getCountrySubstrateForYear } from "@/lib/seeds/eraSubstrateForYear";
import { states } from "@/lib/countries/us/data/usStates";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";

export function runElectorateCoverage2000() {
  clearGranularElectorateCache();
  const rows = [];
  for (const countryId of ["US", "UK", "JP"]) {
    const regions =
      countryId === COUNTRY_CONFIGS.US.id
        ? states.map((s) => s._id)
        : Object.keys(getCountryLayer1Model(countryId, "1999")!.census);
    for (const regionId of regions) {
      const context = { year: 2000, startingYear: 1999 };
      const result = deriveGranularElectorateUnits(
        countryId,
        regionId,
        "1999-default",
        null,
        null,
        null,
        context,
        true
      )!;
      const units = result.units;
      const profile = getBucketProfileForRegion(
        countryId,
        regionId,
        "1999-default",
        null,
        context
      )!;
      const substrate =
        countryId === COUNTRY_CONFIGS.US.id
          ? null
          : getCountrySubstrateForYear(countryId, regionId, 2000)!;
      const missing = substrate
        ? Object.entries(substrate.marginals).flatMap(([dim, buckets]) =>
            Object.entries(buckets)
              .filter(
                ([bucket, pct]) =>
                  pct > 0 &&
                  !(
                    countryId === COUNTRY_CONFIGS.JP.id &&
                    dim === "ethnicity" &&
                    substrate.turnoutRates[dim]?.[bucket] === 0
                  ) &&
                  !profile
                    .find((s) => s.dim === dim)
                    ?.buckets.some((b) => b.id === `${dim}:${bucket}`)
              )
              .map(([bucket]) => `${dim}:${bucket}`)
          )
        : [];
      rows.push({
        countryId,
        regionId,
        units: units.length,
        cells: units.reduce((n, u) => n + (u.campaignCells?.length ?? 0), 0),
        mass: units.reduce((n, u) => n + u.share, 0),
        economicLean: units.reduce((n, u) => n + u.share * u.economicLean, 0),
        socialLean: units.reduce((n, u) => n + u.share * u.socialLean, 0),
        turnout: units.reduce((n, u) => n + u.share * u.turnout, 0),
        missing,
        sections: profile.map((s) => ({
          dim: s.dim,
          buckets: s.buckets.map((b) => ({ id: b.id, share: b.sharePct, turnout: b.turnout })),
        })),
      });
    }
  }
  return {
    preset: "1999-default",
    year: 2000,
    startingYear: 1999,
    databaseCommands: 0,
    databaseBytesRead: 0,
    qualification:
      "Pure electorate derivation; no turn phases, database commands or BSON reads. No longitudinal mechanic changes.",
    rows,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2];
  if (!output) throw new Error("Supply an external report.json path");
  const started = performance.now();
  const cpu = process.cpuUsage();
  const report = runElectorateCoverage2000();
  const diagnostic = {
    elapsedMs: performance.now() - started,
    cpuMicros: process.cpuUsage(cpu),
    peakRssBytes: process.resourceUsage().maxRSS * 1024,
  };
  const baselinePath = process.argv[3];
  const baseline = baselinePath
    ? (JSON.parse(readFileSync(baselinePath, "utf8")) as ReturnType<
        typeof runElectorateCoverage2000
      >)
    : null;
  const comparison = baseline
    ? report.rows.map((row) => {
        const prior = baseline.rows.find(
          (b) => b.countryId === row.countryId && b.regionId === row.regionId
        )!;
        if (!prior) throw new Error(`Missing baseline ${row.countryId}/${row.regionId}`);
        if (
          row.countryId === COUNTRY_CONFIGS.US.id &&
          JSON.stringify(row) !== JSON.stringify(prior)
        )
          throw new Error(`US control changed: ${row.regionId}`);
        if (
          row.missing.length ||
          Math.abs(row.mass - 1) > 1e-10 ||
          ![row.economicLean, row.socialLean, row.turnout].every(Number.isFinite)
        )
          throw new Error(`Invalid electorate ${row.countryId}/${row.regionId}`);
        return {
          countryId: row.countryId,
          regionId: row.regionId,
          restoredBuckets: prior.missing.length - row.missing.length,
          economicShift: row.economicLean - prior.economicLean,
          socialShift: row.socialLean - prior.socialLean,
          turnoutShift: row.turnout - prior.turnout,
          cellsBefore: prior.cells,
          cellsAfter: row.cells,
          unitsBefore: prior.units,
          unitsAfter: row.units,
        };
      })
    : null;
  writeFileSync(output, `${JSON.stringify({ ...report, diagnostic, comparison }, null, 2)}\n`);
  console.log(`Saved electorate coverage report to ${output}`);
}
