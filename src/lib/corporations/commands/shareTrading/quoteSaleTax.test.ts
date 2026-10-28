import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { quoteSaleTax } from "./quoteSaleTax";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: vi.fn(() => ({ ok: true })) }));
vi.mock("@/lib/api/corporations/resolveQuery", () => ({ resolveCorporation: vi.fn() }));
vi.mock("@/lib/equities/marketPool", () => ({
  loadEquityQuote: vi.fn(async () => ({ bidPriceLocal: 1000 })),
}));
vi.mock("@/lib/currency/corporationCapital", () => ({
  getCorpFxRate: vi.fn(async () => 100),
  loadFxRatesRecord: vi.fn(async () => ({ USD: 1 })),
}));
beforeEach(() => vi.clearAllMocks());

async function fixture() {
  const memory = createInMemoryDb();
  const db = memory as unknown as Db;
  const userId = new ObjectId(),
    actorId = new ObjectId(),
    corpId = new ObjectId();
  memory.seed("users", [{ _id: userId, activeCharacterId: actorId }]);
  memory.seed("characters", [
    {
      _id: actorId,
      userId,
      countryId: "US",
      homeState: "US_CA",
      incomeTier: "middle",
      incomeTaxStartTurn: 0,
    },
  ]);
  memory.seed("gameState", [
    { _id: "current", currentTurn: 20, forexEnabled: true, stockHoldingTaxStartTurn: 0 },
  ]);
  memory.seed("federalBudget", [
    {
      _id: "federal",
      countryId: "US",
      currencyCode: "USD",
      taxRates: { incomeTax: 30, capitalGainsTaxMiddle: 20 },
    },
  ]);
  memory.seed("exchangeRates", [{ _id: "USD", currencyCode: "USD", rate: 1 }]);
  memory.seed("playerIncomeTaxAssessments", [
    {
      _id: "old-debt",
      characterId: actorId,
      ownerCollection: "characters",
      status: "unpaid",
      turn: 1,
      sourceFx: 2,
      currency: "USD",
      gross: 100,
      federal: 35,
      regional: 0,
      collectedFederal: 10,
      net: 65,
    },
  ]);
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db);
  const { requireBasicAuth } = await import("@/lib/api/requireAuth");
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: { userId: userId.toHexString() },
  } as never);
  const { resolveCorporation } = await import("@/lib/api/corporations/resolveQuery");
  vi.mocked(resolveCorporation).mockResolvedValue({
    ok: true,
    corporation: {
      _id: corpId,
      sharePrice: 1000,
      liquidCurrencyCode: "JPY",
      shareholders: [{ characterId: actorId, shares: 10, avgCostPerShare: 400 }],
    },
  } as never);
  const preview = (shares: number) =>
    quoteSaleTax(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shares, holdingTerm: "long" }),
      }),
      { params: Promise.resolve({ id: corpId.toHexString() }) }
    );
  return { db, preview };
}
describe("owner sale-tax preview", () => {
  it("normalizes foreign legacy basis, quotes net cash and subtracts partial collections from arrears", async () => {
    const { db, preview } = await fixture();
    const response = await preview(10);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      grossProceeds: 100,
      withheldTax: 12,
      netProceeds: 88,
      outstandingArrears: 25,
    });
    expect(await db.collection("playerIncomeTaxAssessments").countDocuments({})).toBe(1);
    expect(
      (await db.collection("characters").findOne({}))!.pendingStockTaxReceipts
    ).toBeUndefined();
  });
  it("rejects invalid quantities and quantities above the owned holding", async () => {
    const { preview } = await fixture();
    expect((await preview(-1)).status).toBe(400);
    expect((await preview(11)).status).toBe(400);
  });
});
