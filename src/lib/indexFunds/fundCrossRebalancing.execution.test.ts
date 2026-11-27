import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { executeFundCrossRebalancing } from "./fundCrossRebalancing";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
function world() {
  const { db, memory } = createTransactionalMemoryDb();
  const corporationId = new ObjectId(),
    sellerFundId = new ObjectId(),
    buyerFundId = new ObjectId();
  memory.seed("gameState", [{ _id: "current", currentTurn: 7 }]);
  memory.seed("exchangeRates", [{ currencyCode: "USD", rate: 1 }]);
  memory.seed("indexFunds", [
    {
      _id: sellerFundId,
      name: "Seller",
      status: "active",
      anchorCurrencyCode: "USD",
      cashAnchor: 10,
      holdings: [{ corporationId, shares: 20, avgCostPerShareAnchor: 2, lastValueAnchor: 80 }],
    },
    {
      _id: buyerFundId,
      name: "Buyer",
      status: "active",
      anchorCurrencyCode: "USD",
      cashAnchor: 100,
      holdings: [],
    },
  ]);
  memory.seed("corporations", [
    {
      _id: corporationId,
      sharePrice: 4,
      fundamentalSharePrice: 4,
      totalShares: 100,
      publicFloat: 0,
      liquidCurrencyCode: "USD",
      shareholders: [{ fundId: sellerFundId, shares: 20, avgCostPerShare: 2 }],
    },
  ]);
  const plan = {
    corporationId,
    sellerFundId,
    buyerFundId,
    shares: 5,
    pricePerShareAnchor: 4,
    valueAnchor: 20,
  };
  return { db, memory, plan };
}
it.each(["indexFundTransactions", "financialTxLog", "shareTradeHistory"])(
  "rolls back every leg after interrupted %s then replays once",
  async (collection) => {
    const { db, memory, plan } = world();
    const fault = withInjectedCrash(memory, {
      collection,
      op: "insertOne",
      onCall: 1,
      afterWrite: true,
    });
    Object.assign(fault.db, { client: db.client });
    const failed = await executeFundCrossRebalancing(fault.db, [plan], 7);
    expect(failed.transfers).toBe(0);
    expect(failed.errors).toHaveLength(1);
    expect(memory.collection("indexFunds").docs.map((f) => f.cashAnchor)).toEqual([10, 100]);
    expect(memory.collection("corporations").docs[0].shareholders).toHaveLength(1);
    expect(memory.collection("indexFundTransactions").docs).toHaveLength(0);
    fault.disarm();
    const results = await Promise.all([
      executeFundCrossRebalancing(db, [plan], 7),
      executeFundCrossRebalancing(db, [plan], 7),
    ]);
    expect(results.every((r) => r.transfers === 1 && r.errors.length === 0)).toBe(true);
    expect(memory.collection("indexFunds").docs.map((f) => f.cashAnchor)).toEqual([30, 80]);
    expect(memory.collection("indexFundTransactions").docs).toHaveLength(2);
    expect(memory.collection("corporations").docs[0].shareholders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fundId: plan.sellerFundId, shares: 15 }),
        expect.objectContaining({ fundId: plan.buyerFundId, shares: 5, avgCostPerShare: 4 }),
      ])
    );
  }
);
it("preserves unrelated holdings accepted before a transfer and refuses a changed mandate", async () => {
  const { db, memory, plan } = world();
  const other = { corporationId: new ObjectId(), shares: 3, avgCostPerShareAnchor: 7 };
  memory.collection("indexFunds").docs[1].holdings = [other];
  expect((await executeFundCrossRebalancing(db, [plan], 7)).errors).toEqual([]);
  expect(memory.collection("indexFunds").docs[1].holdings).toContainEqual(other);
  memory.collection("indexFunds").docs[1].mandate = { mode: "picked_stocks" };
  expect((await executeFundCrossRebalancing(db, [plan], 8)).transfers).toBe(0);
  expect(memory.collection("indexFunds").docs.map((f) => f.cashAnchor)).toEqual([30, 80]);
});
