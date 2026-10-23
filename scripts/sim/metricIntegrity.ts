/** Deterministic six-country policy-delivery and owner-consistency experiment, not a full-world forecast. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { primaryMetricById } from "../../src/lib/resetMetrics/catalog";
import {
  deliveredMetricEffects,
  type MetricLawProgram,
} from "../../src/lib/resetMetrics/rules/lawDelivery";
import { driftProxyValue } from "../../src/lib/resetMetrics/rules/policyDrift";
import { commodityTradeBalance } from "../../src/lib/resetMetrics/rules/tradeOwner";
import { latestTurnoutReceipts } from "../../src/lib/resetMetrics/rules/turnoutOwner";
import { ownedLegacyValues } from "../../src/lib/resetMetrics/rules/ownedInputs";
import { buildOpeningMetricSnapshots1991 } from "../../src/lib/resetMetrics/seedOpening1991";
import { aggregateNationalMetricValue } from "../../src/lib/resetMetrics/rules/nationalAggregation";

export function simulateMetricIntegrity(horizon = 192) {
  assert(Number.isSafeInteger(horizon) && horizon >= 96);
  const countries = ["US", "UK", "JP", "IE", "SCO", "WAL"] as const;
  const openings = buildOpeningMetricSnapshots1991("sim", 1);
  const results: Array<{
    country: (typeof countries)[number];
    scenario: string;
    points: Record<number, number>;
  }> = [];
  for (const country of countries) {
    const source = openings.find(
      (b) =>
        b.countryId === (country === "SCO" || country === "WAL" ? "UK" : country) &&
        b.scope === "regional"
    )!;
    const metric = primaryMetricById("26")!;
    const initial = { US: 70, UK: 60, JP: 68, IE: 70, SCO: 60, WAL: 60 }[country];
    const program: MetricLawProgram = {
      _id: "existing-law",
      country,
      scope: "national",
      familyId: "L25",
      fundingAccountId: "account",
      effectiveTurn: 2,
      primaryMetricEffects: [{ metricId: "26", favorableNormalizedPoints: 0.8 }],
    };
    for (const scenario of [
      "funded",
      "half",
      "defunded",
      "expired",
      "future",
      "repeal_after_48",
    ] as const) {
      let value = initial;
      const points: Record<number, number> = { 0: value };
      for (let elapsed = 1; elapsed <= horizon; elapsed++) {
        const turn = elapsed + 2;
        const factor =
          scenario === "half"
            ? 0.5
            : scenario === "defunded" || (scenario === "repeal_after_48" && elapsed > 48)
              ? 0
              : 1;
        const p = scenario === "future" ? { ...program, effectiveTurn: horizon + 10 } : program;
        const pressure =
          deliveredMetricEffects(
            [p],
            new Map([
              [
                "existing-law",
                {
                  implementationFactor: factor,
                  lastSettledTurn: scenario === "expired" ? 1 : turn,
                },
              ],
            ]),
            turn
          )["26"] ?? 0;
        value = driftProxyValue({
          metric,
          currentValue: value,
          openingValue: initial,
          pressure,
          countryId: country,
          year: 1991,
        });
        assert(Number.isFinite(value));
        if ([1, 48, 96, horizon].includes(elapsed)) points[elapsed] = value;
      }
      results.push({ country, scenario, points });
    }
    const end = (scenario: string) =>
      results.find((r) => r.country === country && r.scenario === scenario)!.points[horizon]!;
    assert(end("funded") > end("half"));
    assert(end("half") > end("defunded"));
    assert.equal(end("future"), end("defunded"));
    assert.equal(end("expired"), end("defunded"));
    assert(end("repeal_after_48") < end("funded"));
    assert.equal(
      ownedLegacyValues(source.observations)["social.incomeInequality"],
      source.observations["04"]!.value
    );
  }
  const m = primaryMetricById("01")!;
  const observations = (value: number, numerator: number, denominator: number) => ({
    "01": {
      metricId: "01",
      path: m.path,
      owner: m.owner,
      status: "derived" as const,
      value,
      source: "count",
      note: "count",
      ratioBasis: { numerator, denominator },
    },
  });
  const unemployment = aggregateNationalMetricValue("01", [
    {
      regionId: "A",
      population: 100,
      workingAgePopulation: 100,
      observations: observations(0, 0, 90),
    },
    {
      regionId: "B",
      population: 100,
      workingAgePopulation: 100,
      observations: observations(100, 10, 10),
    },
  ]);
  assert.equal(unemployment, 10);
  const turnout = latestTurnoutReceipts(
    [
      { regionId: "A", turn: 5, ballots: 70, eligible: 100, key: "president" },
      { regionId: "A", turn: 5, ballots: 60, eligible: 100, key: "senate" },
    ],
    horizon
  ).get("A")!;
  assert.equal(turnout.ballots, 70);
  const trade = commodityTradeBalance({
    exports: 120,
    imports: 20,
    annualGdpAnchor: 48000,
    turnsPerYear: 48,
  });
  assert.equal(trade, 10);
  return {
    scope:
      "Fixed-input production-rule subsystem trajectories. Synthetic same-state scenarios; existing-law funding and current law delivery tested separately in provider integration tests. No endogenous GDP, prices, election competition, or full-world feedback forecast.",
    horizon,
    results,
    checks: {
      ownerInputEquality: true,
      nationalUnemployment: { priorWorkingAgeMean: 50, countBased: unemployment },
      turnoutWithoutDoubleCounting: turnout.ballots,
      annualizedTradePercent: trade,
    },
  };
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/sim/metricIntegrity.ts")) {
  const report = simulateMetricIntegrity();
  const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
  if (out) writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
