import { expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { caRegions2027 } from "@/lib/countries/ca/data/caRegions2027";
import { generateStateBudgets } from "@/lib/seeds/reference/budgets";
import { loadRegionalHealContext, regionalSpendingForHeal } from "./healRegionalSpending";
import { calculateStateSpendingDetail } from "./spending";
import type { Db } from "mongodb";

vi.mock("./spending", () => ({ calculateStateSpendingDetail: vi.fn() }));

it("keeps Canadian v2 service categories and claims separate from the legacy baseline", async () => {
  const memory = createInMemoryDb();
  memory.seed("gameState", [
    {
      _id: "current",
      preset: "2027-default",
      resetWorldId: "modern",
      metricsSystemVersion: "v2",
      legislationSystemVersion: "v2",
      resetVersionSeeds: {
        metrics: {
          worldId: "modern",
          revision: 3,
          sourceTurn: 1,
          completedAt: "2026-11-14",
          verificationHash: "ok",
          countries: ["CA"],
        },
        legislation: {
          worldId: "modern",
          revision: 6,
          sourceTurn: 1,
          completedAt: "2026-11-14",
          verificationHash: "ok",
          countries: ["CA"],
        },
      },
    },
  ]);
  memory.seed("resetRegionalOpeningBoards", [
    {
      _id: "CA:CA_ON",
      countryId: "CA",
      regionId: "CA_ON",
      worldId: "modern",
      sourceTurn: 1,
      annualSpending: 1000,
      familyOwned: 0,
      otherExistingServices: 1000,
      existingServicesByCategory: { healthcare: 700, education: 300 },
      allocatedClaims: [],
      estimateKind: "proportional-source-pool",
    },
  ]);
  const context = await loadRegionalHealContext(memory as unknown as Db);
  expect(context.enabledCountries).toEqual(["CA"]);
  vi.mocked(calculateStateSpendingDetail).mockResolvedValue({
    spending: { total: 0, byCategory: {} },
    lawCosts: [],
  } as never);
  const spending = await regionalSpendingForHeal(
    memory as unknown as Db,
    {
      stateId: "CA_ON",
      countryId: "CA",
      spending: { total: 0, byCategory: {} },
      revenue: { total: 1000 },
      balance: 0,
    } as never,
    context
  );
  expect(spending.total).toBe(1000);
  expect(spending.byCategory.healthcare).toBe(700);
  expect(spending.byCategory.education).toBe(300);
});

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
