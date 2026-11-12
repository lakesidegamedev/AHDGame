import { describe, expect, it } from "vitest";
import { generateStateBudgets } from "@/lib/seeds/reference/budgets";
import { resolveRegionalSpending } from "@/lib/budget/rules/regionalSpending";
import { caRegions2027 } from "../data/caRegions2027";
import { caProvincialServiceClaims, withCaProvincialServices } from "./provincialServices";

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
  it("retains authority across repeated rollovers while funding only available revenue", () => {
    for (const b of budgets) {
      const services = caProvincialServiceClaims("CA", "2027-default", b.stateId);
      let cash = 0;
      for (const multiplier of [0.86, 0.9, 1.1]) {
        const revenue = Math.round(b.spending.total * multiplier);
        const result = resolveRegionalSpending({
          baseSpending: { byCategory: {}, total: 0 },
          services,
          laws: [],
          programs: [],
          revenue,
          cash,
          settle: true,
        });
        expect(result.authorizedSpending.total).toBe(b.spending.total);
        expect(result.spending.total).toBe(Math.min(b.spending.total, revenue + cash));
        cash += revenue - result.spending.total;
        expect(cash).toBeGreaterThanOrEqual(0);
        if (multiplier < 1) expect(cash).toBe(0);
      }
    }
  });
  it("isolates country, preset and region ownership", () => {
    expect(caProvincialServiceClaims("US", "2027-default", "CA")).toEqual([]);
    expect(caProvincialServiceClaims("CA", "1991-default", "CA_ON")).toEqual([]);
    expect(() => caProvincialServiceClaims("CA", "2027-default", "CA")).toThrow("baseline");
  });
});
