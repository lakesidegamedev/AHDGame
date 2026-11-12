import { expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { caRegions2027 } from "@/lib/countries/ca/data/caRegions2027";
import { generateStateBudgets } from "@/lib/seeds/reference/budgets";
import { loadRegionalHealContext, regionalSpendingForHeal } from "./healRegionalSpending";
import { calculateStateSpendingDetail } from "./spending";
import type { Db } from "mongodb";

vi.mock("./spending", () => ({ calculateStateSpendingDetail: vi.fn() }));

it("rebuilds Canadian services from the fixed source instead of erased or repeatedly healed totals", async () => {
  const db = createInMemoryDb();
  db.seed("gameState", [
    {
      _id: "current",
      preset: "2027-default",
      metricsSystemVersion: "v1",
      legislationSystemVersion: "v1",
    },
  ]);
  const context = await loadRegionalHealContext(db as unknown as Db);
  expect(context.enabled).toBe(false);
  vi.mocked(calculateStateSpendingDetail).mockResolvedValue({
    spending: { total: 0, byCategory: {} },
    lawCosts: [],
  } as never);
  const budget = generateStateBudgets(
    caRegions2027
      .slice(0, 1)
      .map((s) => ({ id: s._id, countryId: s.countryId, population: s.population, gdp: s.gdp })),
    2027
  )[0];
  const erased = { ...budget, spending: { total: 0, byCategory: {} }, balance: 0 };
  const restored = await regionalSpendingForHeal(db as unknown as Db, erased, context);
  expect(restored.total).toBe(budget.spending.total);
  expect(
    await regionalSpendingForHeal(db as unknown as Db, { ...erased, spending: restored }, context)
  ).toEqual(restored);
});
