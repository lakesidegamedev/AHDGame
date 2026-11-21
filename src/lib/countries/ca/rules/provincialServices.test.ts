import { settleRegionalDebt, type RegionalDebtLedger } from "@/lib/budget/rules/regionalDebt";
import { describe, expect, it } from "vitest";
import { generateStateBudgets } from "@/lib/seeds/reference/budgets";
import { resolveRegionalSpending } from "@/lib/budget/rules/regionalSpending";
import { caRegions2027 } from "../data/caRegions2027";
import {
  caProvincialServiceClaims,
  caProvincialGrantDistribution,
  withCaProvincialServices,
} from "./provincialServices";

describe("Canadian provincial standing services", () => {
  const budgets = generateStateBudgets(
    caRegions2027.map((s) => ({
      id: s._id,
      countryId: s.countryId,
      population: s.population,
      gdp: s.gdp,
    })),
    2027
  );
  it("uses the same modeled transfers at opening and annual rollover without country leakage", () => {
    const regions = caRegions2027.map((r) => ({ id: r._id, gdp: r.gdp }));
    const grants = caProvincialGrantDistribution("CA", "2027-default", regions);
    expect(Object.values(grants).reduce((a, b) => a + b, 0)).toBe(41_400_000_000);
    for (const budget of budgets) expect(grants[budget.stateId]).toBe(budget.revenue.federalGrants);
    expect(caProvincialGrantDistribution("US", "2027-default", regions)).toEqual({});
    expect(caProvincialGrantDistribution("CA", "1991-default", regions)).toEqual({});
    const grown = caProvincialGrantDistribution(
      "CA",
      "2027-default",
      regions.map((r) => ({ ...r, gdp: r.gdp * 1.02 }))
    );
    expect(Object.values(grown).reduce((a, b) => a + b, 0)).toBeCloseTo(41_400_000_000 * 1.02, 2);
  });
  it("preserves the existing opening totals and category mix for all provinces", () => {
    expect(budgets.reduce((n, b) => n + b.spending.total, 0)).toBe(335_685_000_000);
    for (const b of budgets) {
      const seeded = withCaProvincialServices(b, "2027-default");
      expect(seeded.spending.total).toBe(b.spending.total);
      for (const [category, amount] of Object.entries(b.spending.byCategory))
        expect(seeded.spending.byCategory[category]).toBeCloseTo(amount, 2);
      expect(seeded.authorizedSpending).toEqual(seeded.spending);
    }
  });
  it("retains service authority and finances deficits across repeated rollovers", () => {
    for (const b of budgets) {
      const services = caProvincialServiceClaims("CA", "2027-default", b.stateId);
      let financing: RegionalDebtLedger | undefined;
      let turn = 0;
      for (const multiplier of [0.86, 0.9, 1.1]) {
        const revenue = Math.round(b.spending.total * multiplier);
        const result = resolveRegionalSpending({
          baseSpending: { byCategory: {}, total: 0 },
          services,
          laws: [],
          programs: [],
          revenue,
          cash: financing?.cash ?? 0,
          settle: true,
        });
        expect(result.authorizedSpending.total).toBe(b.spending.total);
        expect(result.spending.total).toBe(b.spending.total);
        expect(result.settlement?.totalUnfunded).toBe(0);
        const openingDebt = financing?.principal ?? 0;
        for (let period = 0; period < 48; period++) {
          const openingNetAssets = (financing?.cash ?? 0) - (financing?.principal ?? 0);
          financing = settleRegionalDebt({
            previous: financing,
            openingCash: financing?.cash ?? 0,
            annualRevenue: revenue,
            annualPrimarySpending: result.spending.total,
            turn: ++turn,
            turnsPerYear: 48,
          });
          const netReceipts =
            Math.round((revenue / 48) * 100) / 100 -
            Math.round((result.spending.total / 48) * 100) / 100 -
            financing.interestPaid;
          expect(financing.cash - financing.principal).toBeCloseTo(
            openingNetAssets + netReceipts,
            2
          );
          expect(financing.cash).toBeGreaterThanOrEqual(0);
        }
        if (multiplier < 1) expect(financing!.principal).toBeGreaterThan(openingDebt);
        else expect(financing!.principal).toBeLessThan(openingDebt);
      }
    }
  });
  it("isolates country, preset and region ownership", () => {
    expect(caProvincialServiceClaims("US", "2027-default", "CA")).toEqual([]);
    expect(caProvincialServiceClaims("CA", "1991-default", "CA_ON")).toEqual([]);
    expect(() => caProvincialServiceClaims("CA", "2027-default", "CA")).toThrow("baseline");
  });
});
