import { beforeEach, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { processFiscalYear } from "./fiscalYear";
let activeDb: Db;
vi.mock("@/lib/mongodb", () => ({ getDb: async () => activeDb }));
vi.mock("./revenue", async (original) => ({
  ...(await original<typeof import("./revenue")>()),
  calculateFederalRevenue: vi.fn(async () => ({ total: 100, incomeTax: 100 })),
  calculateStateRevenue: vi.fn(async () => ({ total: 40, federalGrants: 10 })),
  normalizeFederalTaxRates: vi.fn((rates) => rates),
  normalizeStateTaxRates: vi.fn((rates) => rates),
}));
vi.mock("./spending", async (original) => ({
  ...(await original<typeof import("./spending")>()),
  calculateFederalSpending: vi.fn(async () => ({
    total: 80,
    byCategory: { healthcare: 79 },
    debtInterest: 1,
    stateGrants: 0,
  })),
  calculateStateSpendingDetail: vi.fn(async () => ({
    spending: { total: 20, byCategory: { education: 20 } },
    lawCosts: [],
  })),
}));
vi.mock("./debt", async (original) => ({
  ...(await original<typeof import("./debt")>()),
  processAnnualDebt: vi.fn(async () => ({
    interestPayment: 1,
    newPrincipal: 1000,
    interestRate: 0.05,
    debtToGdpRatio: 0.1,
    creditRating: "AAA",
    ceilingExceeded: false,
  })),
}));
vi.mock("./grants", async (original) => ({
  ...(await original<typeof import("./grants")>()),
  processFormulaGrants: vi.fn(async () => ({})),
}));
vi.mock("./inflation", () => ({ calculateCountryInflation: vi.fn(async () => 2) }));
vi.mock("@/lib/sovereignDefault/crisisDetection", () => ({
  evaluateSovereignAuctionForCountry: vi.fn(async () => null),
}));
vi.mock("@/lib/sovereignDefault/interestSpiralRestructure", () => ({
  restructureForInterestSpiral: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/news", () => ({ createSystemNewsPost: vi.fn(async () => {}) }));
function world() {
  const { db, memory } = createTransactionalMemoryDb();
  activeDb = db;
  memory.seed("gameState", [
    { _id: "current", currentTurn: 40, preset: "1953-default", metricsSystemVersion: "v1" },
  ]);
  memory.seed(
    "countryGameStates",
    ["US", "CA"].map((_id) => ({ _id, status: "active", enabledForPlayers: true }))
  );
  memory.seed(
    "federalBudget",
    ["US", "CA"].map((countryId) => ({
      _id: countryId === "US" ? "federal" : countryId,
      countryId,
      currencyCode: countryId === "US" ? "USD" : "CAD",
      fiscalYear: 1953,
      treasuryBalance: 200,
      treasuryCashLocal: 200,
      taxRates: {},
      taxBases: { taxableIncome: 100 },
      revenue: { total: 100 },
      spending: { total: 80, byCategory: {} },
      surplus: 20,
      debt: { principal: 1000, ceiling: 2000, interestRate: 0.05 },
      gdp: 10000000,
      gdpSmoothed: 10000000,
      baselineSpendingByCategory: {},
      baselineStateGrants: 0,
    }))
  );
  memory.seed("states", [
    { _id: "TX", countryId: "US", name: "Texas", population: 100, gdp: 10 },
    { _id: "ON", countryId: "CA", name: "Ontario", population: 100, gdp: 10 },
  ]);
  memory.seed("stateBudgets", [
    {
      _id: "TX",
      stateId: "TX",
      countryId: "US",
      fiscalYear: 1953,
      balance: 50,
      taxRates: {},
      taxBases: { taxableIncome: 100 },
      revenue: { total: 40, federalGrants: 10 },
      spending: { total: 20, byCategory: {} },
      stateGdp: 10000000,
    },
  ]);
  memory.seed("exchangeRates", [
    { currencyCode: "USD", rate: 1 },
    { currencyCode: "CAD", rate: 1.4 },
  ]);
  return { db, memory };
}
beforeEach(() => vi.clearAllMocks());
it.each(["stateBudgets", "federalBudgetSnapshots"])(
  "rolls back a country after interrupted %s and overlapping retries do not reprice its accepted year",
  async (collection) => {
    const { db, memory } = world();
    const selected = withInjectedCrash(memory, {
      collection,
      op: collection === "stateBudgets" ? "updateOne" : "replaceOne",
      onCall: 1,
      afterWrite: true,
    });
    Object.assign(selected.db, { client: db.client });
    await expect(processFiscalYear(selected.db, 1954, 40)).rejects.toThrow(
      "fiscalYear must succeed"
    );
    expect(memory.collection("federalBudget").docs[0]).toMatchObject({
      fiscalYear: 1953,
      treasuryBalance: 200,
      debt: { principal: 1000 },
    });
    expect(memory.collection("stateBudgets").docs[0]).toMatchObject({
      fiscalYear: 1953,
      balance: 50,
    });
    selected.disarm();
    await Promise.all([processFiscalYear(db, 1954, 40), processFiscalYear(db, 1954, 40)]);
    expect(
      memory
        .collection("federalBudget")
        .docs.every((row) => row.fiscalYear === 1954 && row.treasuryBalance === 200)
    ).toBe(true);
    expect(memory.collection("stateBudgets").docs[0]).toMatchObject({
      fiscalYear: 1954,
      balance: 50,
    });
    const accepted = structuredClone(memory.collection("federalBudget").docs[0]);
    memory.collection("states").docs[0].gdp = 100;
    await processFiscalYear(db, 1954, 40);
    expect(memory.collection("federalBudget").docs[0]).toEqual(accepted);
  }
);
it("keeps already-completed countries frozen when an auction-stage interruption is retried", async () => {
  const { db, memory } = world();
  const { evaluateSovereignAuctionForCountry } =
    await import("@/lib/sovereignDefault/crisisDetection");
  vi.mocked(evaluateSovereignAuctionForCountry).mockRejectedValueOnce(
    new Error("auction interrupted")
  );
  await expect(processFiscalYear(db, 1954, 40)).rejects.toThrow("auction interrupted");
  const accepted = structuredClone(memory.collection("federalBudget").docs);
  memory.collection("states").docs[0].gdp = 100;
  await processFiscalYear(db, 1954, 40);
  expect(memory.collection("federalBudget").docs).toEqual(accepted);
  expect(
    memory.collection("bankMoneyMoves").docs.filter((row) => row.phase === "fiscal-year-country")
  ).toHaveLength(2);
});
