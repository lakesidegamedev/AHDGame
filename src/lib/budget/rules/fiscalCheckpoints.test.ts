import { describe, expect, it } from "vitest";
import {
  FISCAL_CHECKPOINT_COUNTRIES,
  fiscalOpening,
  macroAtFor,
  AVERAGE_MATURITY_YEARS,
  type FiscalCheckpointCountry,
} from "../fiscalCheckpointInputs";
import {
  FISCAL_CHECKPOINT_YEARS,
  projectFiscalCheckpoints,
  type FiscalOpening,
  type FiscalPolicy,
  type FiscalRun,
} from "./fiscalCheckpoints";
import { INTEREST_REVENUE_RESTRUCTURE_SHARE } from "./fiscalStabilizer";

function run(
  country: FiscalCheckpointCountry,
  policy: Partial<FiscalPolicy> = {},
  opening: FiscalOpening = fiscalOpening(country),
  macroShift = 0
): FiscalRun {
  const macro = macroAtFor(country);
  return projectFiscalCheckpoints({
    opening,
    macroAt: (year) => {
      const m = macro(year);
      return { ...m, policyRate: m.policyRate + macroShift };
    },
    policy: { averageMaturityYears: AVERAGE_MATURITY_YEARS[country], ...policy },
  });
}

const at = (r: FiscalRun, year: number) => r.rows.find((row) => row.year === year)!;

describe("long-run fiscal checkpoints", () => {
  it("has the opening, 2030, 2035, 2040, 2045 and 2050 rows for all five countries", () => {
    for (const country of FISCAL_CHECKPOINT_COUNTRIES) {
      const r = run(country);
      for (const year of FISCAL_CHECKPOINT_YEARS)
        expect(at(r, year), `${country} ${year}`).toBeTruthy();
    }
  });

  it("is deterministic", () => {
    expect(run("US")).toEqual(run("US"));
  });

  it("carries the authored macro arc into the table", () => {
    expect(at(run("US"), 2027)).toMatchObject({ growth: 1.9, inflation: 2, policyRate: 2.8 });
    expect(at(run("CN"), 2045).growth).toBe(2.5);
    expect(at(run("JP"), 2040).inflation).toBe(1);
  });

  it("keeps every figure bounded and gives the five countries different paths", () => {
    const finals = new Set<string>();
    for (const country of FISCAL_CHECKPOINT_COUNTRIES) {
      const r = run(country);
      for (const row of r.rows) {
        expect(Number.isFinite(row.gdp), `${country} ${row.year}`).toBe(true);
        expect(row.debtRatio, `${country} ${row.year} debt`).toBeGreaterThan(-20);
        expect(row.debtRatio, `${country} ${row.year} debt`).toBeLessThan(260);
        expect(
          row.interestShareOfRevenue,
          `${country} ${row.year} interest`
        ).toBeGreaterThanOrEqual(0);
        expect(row.interestShareOfRevenue, `${country} ${row.year} interest`).toBeLessThan(
          INTEREST_REVENUE_RESTRUCTURE_SHARE * 100 + 15
        );
      }
      finals.add(at(r, 2050).debtRatio.toFixed(0));
    }
    expect(finals.size).toBe(5);
  });

  describe("no country stays with interest above revenue without a crisis or restructuring", () => {
    const stressed = (country: FiscalCheckpointCountry): FiscalOpening => {
      const o = fiscalOpening(country);
      return {
        ...o,
        debt: 2.6 * o.gdp,
        debtInterest: 2.6 * o.gdp * 0.06,
        effectiveRate: 0.06,
      };
    };

    it("holds under default settings and under a punishing rate and debt stress", () => {
      for (const country of FISCAL_CHECKPOINT_COUNTRIES) {
        for (const r of [run(country), run(country, {}, stressed(country), 4)]) {
          const restructured = new Set(
            r.events.filter((e) => e.kind === "restructuring").map((e) => e.year)
          );
          for (const row of r.rows) {
            if (row.interestShareOfRevenue > INTEREST_REVENUE_RESTRUCTURE_SHARE * 100) {
              const resolved = restructured.has(row.year) || restructured.has(row.year + 1);
              expect(resolved, `${country} ${row.year} above half of revenue, unresolved`).toBe(
                true
              );
            }
          }
          expect(at(r, 2050).interestShareOfRevenue).toBeLessThan(100);
        }
      }
    });

    it("forces a restructuring that cuts debt and the interest bill under stress", () => {
      const r = run("JP", {}, stressed("JP"), 4);
      const event = r.events.find((e) => e.kind === "restructuring");
      expect(event).toBeDefined();
      const flow = r.flows.find((f) => f.year === event!.year)!;
      expect(flow.writtenOff).toBeGreaterThan(0);
      const after = at(r, event!.year + 1);
      expect(after.debtRatio).toBeLessThan(at(r, event!.year).debtRatio);
    });
  });

  describe("policy changes move the checkpoints", () => {
    it("more revenue lowers debt and interest; more spending raises them", () => {
      for (const country of FISCAL_CHECKPOINT_COUNTRIES) {
        const base = at(run(country), 2040);
        const taxed = at(run(country, { revenueGdpShareDelta: 0.03 }), 2040);
        const spent = at(run(country, { primarySpendingGdpShareDelta: 0.03 }), 2040);
        expect(taxed.debtRatio, country).toBeLessThan(base.debtRatio);
        expect(spent.debtRatio, country).toBeGreaterThan(base.debtRatio);
      }
    });

    it("a higher policy rate raises the interest share before the stabilizer responds", () => {
      for (const country of FISCAL_CHECKPOINT_COUNTRIES) {
        const base = at(run(country), 2031).interestShareOfRevenue;
        const hot = at(run(country, {}, undefined, 3), 2031).interestShareOfRevenue;
        expect(hot, country).toBeGreaterThan(base);
      }
    });

    it("a longer average maturity delays the repricing of debt", () => {
      const short = at(run("US", { averageMaturityYears: 3 }, undefined, 3), 2032);
      const long = at(run("US", { averageMaturityYears: 20 }, undefined, 3), 2032);
      expect(short.interestShareOfRevenue).toBeGreaterThan(long.interestShareOfRevenue);
    });
  });

  describe("reconciles across fiscal-year boundaries and the maturity wall", () => {
    it("debt rolls forward year to year and every year's stock-flow identity holds", () => {
      for (const country of FISCAL_CHECKPOINT_COUNTRIES) {
        const r = run(country);
        r.flows.forEach((flow, i) => {
          const identity = flow.debtOpening + flow.deficit - flow.writtenOff;
          const tol = 1e-9 * Math.abs(flow.debtOpening) + 1;
          expect(
            Math.abs(flow.debtClosing - identity),
            `${country} ${flow.year}`
          ).toBeLessThanOrEqual(tol);
          expect(
            Math.abs(flow.deficit - (flow.primarySpending + flow.interest - flow.revenue))
          ).toBeLessThanOrEqual(tol);
          if (i > 0) expect(flow.debtOpening).toBe(r.flows[i - 1]!.debtClosing);
        });
      }
    });

    it("a wall refinancing moves no debt and changes interest only by the repricing", () => {
      for (const country of FISCAL_CHECKPOINT_COUNTRIES) {
        const r = run(country, { averageMaturityYears: 1 });
        // A one-year maturity refinances the whole stock at every boundary.
        for (const flow of r.flows) {
          expect(flow.refinanced, `${country} ${flow.year}`).toBe(Math.max(0, flow.debtOpening));
          const moved = flow.debtClosing - flow.debtOpening;
          const expected = flow.deficit - flow.writtenOff;
          expect(Math.abs(moved - expected)).toBeLessThanOrEqual(
            1e-9 * Math.abs(flow.debtOpening) + 1
          );
        }
      }
    });
  });
});
