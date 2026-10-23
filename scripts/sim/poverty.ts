/**
 * Fixed-input poverty trajectories using the production node and coexistence rules.
 * Optional --snapshot=<JSON> accepts projected regional macro inputs, never players.
 * This is not a forecast of endogenous GDP, employment or future funding.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { povertyRateNode } from "../../src/lib/metricEngine/registry/economic";
import { evalNode } from "../../src/lib/metricEngine/coexistence";
import type { RegistryNode } from "../../src/lib/metricEngine/types";

export interface PovertySimulationRegion {
  id: string;
  country: string;
  population: number;
  poverty: number;
  baseline: number;
  unemployment: number;
  giniInput: number;
  crimeInput: number;
  socialReferencePerCapita: number;
  deliveredPressure: number;
  targetNudge?: number;
}

const legacyNode: RegistryNode = {
  ...povertyRateNode,
  baselineDecimals: 6,
  policyDeltaDecay: 1,
  decayPolicyDelta: undefined,
  inputs: povertyRateNode.inputs.filter(
    (input) => typeof input === "string" || !("provider" in input)
  ),
  compute: (ctx) =>
    13 +
    ((ctx.current["economic.unemploymentRate"] ?? 5) - 5) * 0.6 +
    ((ctx.current["social.incomeInequality"] ?? 42) - 42) * 0.15 +
    ((ctx.prev["publicSafety.crimeRate"] ?? 4500) - 4500) * 0.0004 -
    (6 * (ctx.spending.social ?? 0)) / ((ctx.spending.social ?? 0) + 2700),
};

export function simulatePoverty(rows: readonly PovertySimulationRegion[], horizon = 384) {
  assert(rows.length > 0 && Number.isSafeInteger(horizon) && horizon >= 96);
  for (const row of rows) {
    assert(row.country && row.id && row.population > 0);
    for (const value of Object.values(row))
      if (typeof value === "number") assert(Number.isFinite(value));
  }
  const scenarios = [
    "legacy",
    "funded",
    "half_funding",
    "zero_funding",
    "repeal_after_48",
    "unemployment_5",
    "unemployment_2",
  ] as const;
  const summary = [];
  for (const scenario of scenarios) {
    const trajectories = rows.map((row) => {
      let value = row.poverty,
        baseline = row.baseline;
      const points: Record<number, number> = { 0: value };
      for (let elapsed = 1; elapsed <= horizon; elapsed++) {
        const pressure =
          scenario === "zero_funding" || (scenario === "repeal_after_48" && elapsed > 48)
            ? 0
            : row.deliveredPressure * (scenario === "half_funding" ? 0.5 : 1);
        const unemployment =
          scenario === "unemployment_5" ? 5 : scenario === "unemployment_2" ? 2 : row.unemployment;
        const result = evalNode(
          scenario === "legacy" ? legacyNode : povertyRateNode,
          {
            current: {
              "economic.unemploymentRate": unemployment,
              "social.incomeInequality": row.giniInput,
            },
            prev: {
              "economic.povertyRate": value,
              "publicSafety.crimeRate": scenario === "legacy" ? 4500 : row.crimeInput,
            },
            prevSimBaseline: { "economic.povertyRate": baseline },
            providers:
              scenario === "legacy" ? {} : { povertyPolicy: { deliveredPressure: pressure } },
            spending: { social: row.socialReferencePerCapita },
            policyValue: value,
            targetNudge: row.targetNudge ?? 0,
          },
          row.id
        );
        value = result.value;
        baseline = result.simBaseline;
        assert(
          Number.isFinite(value) &&
            value >= povertyRateNode.bounds[0] &&
            value <= povertyRateNode.bounds[1]
        );
        if ([1, 24, 48, 96, 192, horizon].includes(elapsed)) points[elapsed] = value;
      }
      return { ...row, points };
    });
    for (const country of [...new Set(rows.map((row) => row.country))]) {
      const regional = trajectories.filter((row) => row.country === country);
      const population = regional.reduce((sum, row) => sum + row.population, 0);
      const points = Object.fromEntries(
        Object.keys(regional[0]!.points).map((elapsed) => [
          elapsed,
          regional.reduce((sum, row) => sum + row.population * row.points[Number(elapsed)]!, 0) /
            population,
        ])
      );
      summary.push({ scenario, country, regions: regional.length, points });
    }
  }
  return {
    horizon,
    scope: "isolated fixed-input production poverty node; no endogenous world feedback",
    summary,
  };
}

function main() {
  const arg = (name: string) =>
    process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
  const snapshot = arg("snapshot");
  const input = snapshot
    ? (JSON.parse(readFileSync(snapshot, "utf8")) as {
        sourceTurn: number;
        rows: PovertySimulationRegion[];
      })
    : {
        sourceTurn: 10,
        rows: ["US", "UK", "JP", "IE", "SCO", "WAL", "DE"].map((country) => ({
          id: `${country}-synthetic`,
          country,
          population: 100000,
          poverty: 20,
          baseline: 15,
          unemployment: 10,
          giniInput: 42,
          crimeInput: 4500,
          socialReferencePerCapita: 1000,
          deliveredPressure: 1.5,
        })),
      };
  const report = {
    sourceTurn: input.sourceTurn,
    inputSha256: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
    ...simulatePoverty(input.rows),
  };
  const output = arg("out");
  if (output) writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/sim/poverty.ts")) main();
