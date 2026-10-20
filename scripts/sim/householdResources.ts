/** Controlled household accounting experiment. Not a live forecast or country-adapter qualification. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { COUNTRY_CONFIGS } from "../../src/lib/constants/countries";
import {
  incomeTaxRate,
  playerIncomeTax,
  type IncomeTaxRates,
  type IncomeTier,
} from "../../src/lib/budget/rules/incomeTaxTiers";
import {
  allocateHouseholdCash,
  householdResourceOutcomes,
  resolveHouseholdResources,
  type HouseholdResourceGroup,
} from "../../src/lib/resetMetrics/rules/householdResources";
import {
  metricLawOutlaysAtTurn,
  type MetricLawProgram,
} from "../../src/lib/resetMetrics/rules/lawDelivery";
import { TURNS_PER_YEAR } from "../../src/lib/constants/turnTime";
import { resolveHouseholdCountry } from "../../src/lib/resetMetrics/rules/householdReadiness";

interface SimulationPoint {
  turn: number;
  realMedian: number;
  gini: number | null;
  poverty50: number | null;
  povertyGap50: number | null;
  totals: ReturnType<typeof resolveHouseholdResources>["totals"];
}

export function simulateHouseholdResources(turns = 96) {
  assert(Number.isSafeInteger(turns) && turns >= 2);
  const scenarios = [
    "unchanged",
    "paid-relief",
    "half-paid-relief",
    "unfunded",
    "services-only",
    "progressive-tax",
    "uniform-growth",
    "inflation-only",
  ] as const;
  const results: {
    countryId: string;
    scenario: (typeof scenarios)[number];
    points: SimulationPoint[];
  }[] = [];
  for (const countryId of Object.keys(COUNTRY_CONFIGS).sort()) {
    for (const scenario of scenarios) {
      const points: SimulationPoint[] = [];
      for (let turn = 1; turn <= turns; turn++) {
        // Identical synthetic local-currency fixture in each country tests the
        // portable rules, not actual country composition, laws or living standards.
        const enacted = turn >= 2;
        const groups = [
          { id: "low", households: 30, income: 6000, tier: "low" },
          { id: "middle", households: 50, income: 24000, tier: "middle" },
          { id: "high", households: 20, income: 60000, tier: "high" },
        ] as const;
        const taxRates: IncomeTaxRates =
          scenario === "progressive-tax" && enacted
            ? { incomeTaxLow: 5, incomeTaxMiddle: 15, incomeTaxHigh: 35 }
            : { incomeTax: 15 };
        const multiplier = scenario === "uniform-growth" && enacted ? 2 : 1;
        const eligible = groups.map((g) => ({
          id: g.id,
          households: g.households,
          eligibility: g.id === "low" ? 1 : 0,
        }));
        const program: MetricLawProgram = {
          _id: "existing-law",
          country: countryId,
          scope: "national",
          familyId: "L01",
          fundingAccountId: "fixture-account",
          effectiveTurn: 2,
          primaryMetricEffects: [],
        };
        const factor =
          enacted && scenario === "paid-relief"
            ? 1
            : enacted && scenario === "half-paid-relief"
              ? 0.5
              : 0;
        // Fixture confirms a payment; it does not derive paid money from the law's score.
        const payments = metricLawOutlaysAtTurn(
          [program],
          new Map([
            [
              program._id,
              {
                implementationFactor: factor,
                lastSettledTurn: turn,
                paymentKey: `fixture:${countryId}:${turn}`,
                outlaid: 5000 * factor,
              },
            ],
          ]),
          turn
        );
        const paidPool = payments.reduce((sum, p) => sum + p.amount, 0);
        const cash = allocateHouseholdCash({
          paidPool: paidPool * TURNS_PER_YEAR,
          recipients: eligible,
        });
        const cells: HouseholdResourceGroup[] = groups.map((g) => {
          const marketIncome = g.income * multiplier;
          const tax = playerIncomeTax(
            marketIncome,
            incomeTaxRate(taxRates, g.tier as IncomeTier),
            0
          );
          return {
            id: g.id,
            households: g.households,
            adults: 1,
            children: 0,
            marketIncome,
            paidCashTransfers: cash.allocations.find((a) => a.id === g.id)!.perHousehold,
            directTaxes: tax.federal,
            employeeContributions: 0,
          };
        });
        const reading = resolveHouseholdResources({
          countryId,
          regionId: "synthetic",
          currency: "synthetic-local",
          priceBaseYear: 1991,
          measurementTurn: turn,
          consumerPriceIndex: scenario === "inflation-only" && enacted ? 110 : 100,
          groups: cells,
        });
        const outcomes = householdResourceOutcomes([reading]);
        // A successful synthetic experiment never qualifies an actual country.
        // Verify the deployment boundary retains existing values and timestamps.
        const existing = { poverty: 30, lastUpdatedTurn: 1 };
        const retained = resolveHouseholdCountry({
          existing,
          readings: [reading],
          coverage: {
            countryId,
            currency: reading.currency,
            priceBaseYear: 1991,
            measurementTurn: turn,
            regions: [{ regionId: "synthetic", householdResidents: reading.totals.people }],
            references: {},
          },
        });
        assert.equal(retained.path, "existing");
        assert.strictEqual(retained.value, existing);
        assert.equal(existing.lastUpdatedTurn, 1);
        const totals = reading.totals;
        assert(
          Math.abs(
            totals.marketIncome +
              totals.paidCashTransfers -
              totals.directTaxes -
              totals.employeeContributions -
              totals.disposableIncome
          ) < 1e-6
        );
        assert(Math.abs(totals.paidCashTransfers - paidPool * TURNS_PER_YEAR) < 1e-6);
        if (turn === 1 || turn === 2 || turn % 12 === 0 || turn === turns)
          points.push({
            turn,
            realMedian: outcomes.realMedian,
            gini: outcomes.gini,
            poverty50: outcomes.poverty50.rate,
            povertyGap50: outcomes.poverty50.gap,
            totals,
          });
      }
      results.push({ countryId, scenario, points });
    }
  }
  for (const countryId of Object.keys(COUNTRY_CONFIGS)) {
    const last = (scenario: (typeof scenarios)[number]) =>
      results.find((r) => r.countryId === countryId && r.scenario === scenario)!.points.at(-1)!;
    for (const scenario of ["unfunded", "services-only"] as const) {
      assert.equal(last(scenario).poverty50, last("unchanged").poverty50);
      assert.equal(last(scenario).gini, last("unchanged").gini);
    }
    assert(last("paid-relief").poverty50! < last("unchanged").poverty50!);
    assert(last("half-paid-relief").povertyGap50! > last("paid-relief").povertyGap50!);
    assert.equal(last("uniform-growth").poverty50, last("unchanged").poverty50);
    assert.equal(last("uniform-growth").gini, last("unchanged").gini);
    assert.equal(last("uniform-growth").realMedian, 2 * last("unchanged").realMedian);
    assert(last("inflation-only").realMedian < last("unchanged").realMedian);
    assert(last("progressive-tax").gini! < last("unchanged").gini!);
  }
  return {
    scope:
      "Controlled flow accounting using identical synthetic households in every configured country. No country-adapter, production-pipeline or full-world qualification and no live forecast.",
    turns,
    countries: Object.keys(COUNTRY_CONFIGS).length,
    scenarios,
    incompleteCountryPolicy:
      "retain existing values and measurement dates; no synthetic initialization",
    results,
  };
}

const out = process.argv.find((arg) => arg.startsWith("--out="))?.slice(6);
if (out) {
  const report = simulateHouseholdResources();
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      countries: report.countries,
      scenarios: report.scenarios.length,
      turns: report.turns,
    })
  );
}
