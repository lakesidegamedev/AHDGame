import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
let db: Db;
vi.mock("@/lib/mongodb", () => ({ getDb: async () => db }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: async () => ({ ok: true }) }));
vi.mock("@/lib/budget/revenue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/budget/revenue")>()),
  calculateStateRevenue: async () => ({ total: 200, federalGrants: 0 }),
}));
vi.mock("@/lib/budget/spending", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/budget/spending")>()),
  calculateStateSpendingDetail: async () => ({
    spending: { total: 20, byCategory: { education: 20 } },
    lawCosts: [
      {
        law: { legislationTypeId: "audit-added-regional-law", policyOptionIndex: 0 },
        annualCost: 20,
        category: "education",
      },
    ],
  }),
}));
import { POST } from "./route";
beforeEach(async () => {
  db = createInMemoryDb() as unknown as Db;
  const receipt = (revision: number) => ({
    worldId: "w",
    revision,
    sourceTurn: 1,
    completedAt: "2026-11-12",
    verificationHash: "verified",
    countries: ["US"],
  });
  await db.collection("gameState").insertOne({
    _id: "current" as never,
    preset: "2027-default",
    resetWorldId: "w",
    metricsSystemVersion: "v2",
    legislationSystemVersion: "v2",
    resetVersionSeeds: { metrics: receipt(3), legislation: receipt(6) },
  });
  await db
    .collection("states")
    .insertOne({ _id: "TX" as never, countryId: "US", population: 100, gdp: 1 });
  await db.collection("stateBudgets").insertOne({
    _id: "TX" as never,
    stateId: "TX",
    countryId: "US",
    balance: 125,
    surplus: 80,
    taxRates: {
      incomeTax: 5,
      salesTax: 5,
      domesticCorporateTax: 5,
      foreignCorporateTax: 5,
      propertyTax: 1,
    },
    revenue: { total: 200, federalGrants: 0 },
    spending: { total: 120, byCategory: { education: 80, healthcare: 40 } },
  });
  await db.collection("resetRegionalOpeningBoards").insertOne({
    _id: "US:TX" as never,
    countryId: "US",
    worldId: "w",
    regionId: "TX",
    sourceTurn: 1,
    annualSpending: 100,
    familyOwned: 0,
    otherExistingServices: 100,
    allocatedClaims: [],
    estimateKind: "proportional-source-pool",
    existingServicesByCategory: { education: 60, healthcare: 40 },
  });
  await db.collection("enactedLaws").insertOne({
    countryId: "US",
    scope: "national",
    legislationTypeId: "us.education.schooling.primary",
    costModelV2: { gdpCostFraction: 0.01 },
    policyOptionIndex: 3,
  });
});
describe("budget healing protects the current US book", () => {
  it("does not seed legacy US laws, drop existing services, or overwrite accumulated cash", async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    const us = await db.collection("enactedLaws").find({ countryId: "US" }).toArray();
    expect(us.map((l) => l.legislationTypeId)).toEqual(["us.education.schooling.primary"]);
    const budget = await db.collection("stateBudgets").findOne({ _id: "TX" as never });
    expect(budget!.spending.total).toBe(120);
    expect(budget!.spending.byCategory).toMatchObject({ education: 80, healthcare: 40 });
    expect(budget!.balance).toBe(125);
    expect(budget!.surplus).toBe(80);
    expect((await POST()).status).toBe(200);
    expect((await db.collection("stateBudgets").findOne({ _id: "TX" as never }))!.balance).toBe(
      125
    );
  });
});
