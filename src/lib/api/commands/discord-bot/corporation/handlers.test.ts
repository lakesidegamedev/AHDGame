import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { GET } from "./handlers";
const host = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  financials: {} as Record<string, number>,
}));
vi.mock("next/cache", () => ({ unstable_cache: (work: unknown) => work }));
vi.mock("@/lib/mongodb", () => ({ getDb: async () => host.db }));
vi.mock("@/lib/api/requireBotToken", () => ({ requireBotToken: () => true }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: () => ({ ok: true }),
  rateLimitResponse: vi.fn(),
  BOT_READ_LIMITS: { maxRequests: 10, windowMs: 1000 },
}));
vi.mock("@/lib/gameState", () => ({
  getGameState: async () => ({ currentTurn: 100, preset: "2027-default" }),
}));
vi.mock("@/lib/corporations/queries/corporationDetail", () => ({
  loadCorporationDetailView: async () => ({
    financials: host.financials,
    balanceSheet: {
      liabilities: { totalDebt: 0 },
      assets: { totalAssets: 1000, totalSectorNPV: 0 },
      equity: { bookValue: 1000, totalEquity: 1000 },
    },
  }),
}));
beforeEach(() => {
  const memory = createInMemoryDb();
  host.db = memory as unknown as Db;
  memory.seed("corporations", [
    {
      _id: new ObjectId(),
      name: "Synthetic subsidiary",
      countryId: "US",
      headquartersState: "CT",
      liquidCurrencyCode: "USD",
      liquidCapital: 1000,
      totalShares: 100,
      sharePrice: 10,
      shareholders: [],
      dividendRate: 0,
    },
  ]);
  memory.seed("exchangeRates", [{ _id: "US", currencyCode: "USD", rate: 1 }]);
  host.financials = {
    income: 100,
    dividendDistribution: 25,
    effectiveDividendRate: 25,
    totalRevenue: 200,
    operatingCosts: 100,
    operatingIncome: 100,
    totalCosts: 100,
    bankLoanInterestCost: 0,
    bondInterestCost: 0,
    growthCosts: 0,
    maintenanceCosts: 100,
    marketingCosts: 0,
  };
});
it("reads the shared parent-floor payout rather than reconstructing a zero policy from the subsidiary", async () => {
  const response = await GET(
    new Request("http://localhost/api/discord-bot/corporation?name=Synthetic%20subsidiary")
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    financialBasis: "estimate",
    corporation: { dividendRate: 25 },
    financials: { income: 100, dailyDividendPayout: 25, retainedEarnings: 75 },
  });
});
it("uses actual settled payout and retained earnings without subtracting the dividend twice", async () => {
  Object.assign(host.financials, {
    income: 400,
    dividendDistribution: 100,
    realizedIncome: 75,
    realizedDividendPaid: 25,
    realizedIncomeTurn: 99,
  });
  const response = await GET(
    new Request("http://localhost/api/discord-bot/corporation?name=Synthetic%20subsidiary")
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    financialBasis: "settled",
    financialTurn: 99,
    financials: { income: 100, dailyDividendPayout: 25, retainedEarnings: 75 },
  });
});
