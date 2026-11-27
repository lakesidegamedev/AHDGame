import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { fillPendingShareOrders } from "./shareOrders";
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
const corpId = new ObjectId(),
  characterId = new ObjectId(),
  fundId = new ObjectId();
function fixture(float = 100) {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 9,
      worldEpochId: "synthetic-queued-shares",
      preset: "2027-default",
    },
  ]);
  f.memory.seed("exchangeRates", [{ _id: "US", currencyCode: "USD", rate: 1, baseRate: 1 }]);
  f.memory.seed("corporations", [
    {
      _id: corpId,
      name: "Synthetic issuer",
      countryId: "US",
      liquidCurrencyCode: "USD",
      liquidCapital: 2000,
      sharePrice: 10,
      fundamentalSharePrice: 10,
      totalShares: 1000,
      publicFloat: float,
      shareholders: [],
    },
  ]);
  f.memory.seed("equityMarketPools", [{ _id: "USD", cashLocal: 10000, targetCashLocal: 10000 }]);
  f.memory.seed("characters", [
    { _id: characterId, countryId: "US", name: "Synthetic buyer", cashOnHand: 0 },
  ]);
  f.memory.seed("indexFunds", [
    { _id: fundId, name: "Synthetic fund", cashAnchor: 0, holdings: [] },
  ]);
  f.memory.seed("shareOrders", [
    {
      _id: new ObjectId(),
      corporationId: corpId,
      characterId,
      type: "buy",
      shares: 10,
      sharesRemaining: 10,
      pricePerShare: 20,
      escrowAmount: 200,
      escrowAnchor: 200,
      status: "open",
    },
    {
      _id: new ObjectId(),
      corporationId: corpId,
      placerFundId: fundId,
      type: "buy",
      shares: 10,
      sharesRemaining: 10,
      pricePerShare: 20,
      escrowAmount: 200,
      escrowAnchor: 200,
      status: "open",
    },
  ]);
  return f;
}
async function assertConservation(f: ReturnType<typeof fixture>) {
  const pool = await f.db.collection("equityMarketPools").findOne({});
  const char = await f.db.collection("characters").findOne({});
  const fund = await f.db.collection("indexFunds").findOne({});
  const orders = await f.db.collection("shareOrders").find({}).toArray();
  expect(
    pool!.cashLocal +
      char!.cashOnHand +
      fund!.cashAnchor +
      orders.reduce((sum, row) => sum + (row.escrowAmount ?? 0), 0)
  ).toBeCloseTo(10400, 2);
  const corp = await f.db.collection("corporations").findOne({});
  expect(
    corp!.publicFloat +
      corp!.shareholders.reduce((sum: number, row: { shares: number }) => sum + row.shares, 0)
  ).toBe(100);
}
describe("queued order whole-round settlement", () => {
  it.each([
    "equityMarketPools",
    "shareOrders",
    "corporations",
    "characters",
    "indexFunds",
    "shareTradeHistory",
    "bankMoneyMoves",
  ])("rolls back landed %s before replaying cash, holdings and escrow", async (collection) => {
    const f = fixture();
    const before = await f.db.collection("shareOrders").find({}).toArray();
    const fault = withInjectedCrash(f.memory, { collection, onCall: 1, afterWrite: true });
    await expect(fillPendingShareOrders(fault.db, new Date(0), 10)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(await f.db.collection("shareOrders").find({}).toArray()).toEqual(before);
    expect((await f.db.collection("equityMarketPools").findOne({}))!.cashLocal).toBe(10000);
    await fillPendingShareOrders(f.db, new Date(0), 10);
    await fillPendingShareOrders(f.db, new Date(0), 10);
    await assertConservation(f);
    expect((await f.db.collection("indexFunds").findOne({}))!.holdings[0].shares).toBe(10);
    expect(await f.db.collection("shareTradeHistory").countDocuments({})).toBe(2);
  });
  it("overlapping rounds preserve the original fill and refund amounts", async () => {
    const f = fixture();
    await Promise.all([
      fillPendingShareOrders(f.db, new Date(0), 10),
      fillPendingShareOrders(f.db, new Date(0), 10),
    ]);
    await assertConservation(f);
    expect(await f.db.collection("shareTradeHistory").countDocuments({})).toBe(2);
  });
  it("a partial fill is not recomputed from its remaining escrow on same-turn replay", async () => {
    const f = fixture(5);
    await fillPendingShareOrders(f.db, new Date(0), 10);
    const rows = await f.db.collection("shareOrders").find({}).toArray();
    const corp = await f.db.collection("corporations").findOne({});
    await fillPendingShareOrders(f.db, new Date(0), 10);
    expect(await f.db.collection("shareOrders").find({}).toArray()).toEqual(rows);
    expect(await f.db.collection("corporations").findOne({})).toEqual(corp);
  });
});
