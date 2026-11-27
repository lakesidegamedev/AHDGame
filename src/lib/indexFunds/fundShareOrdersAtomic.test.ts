import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { emitTx } from "@/lib/financialTxLog/emit";
import {
  cancelFundShareOrder,
  placeFundQuotesBatch,
  placeFundShareBuyOrder,
  placeFundShareSellOrder,
} from "./fundShareOrders";
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTx: vi.fn().mockResolvedValue("applied"),
  emitTxBulk: vi.fn().mockResolvedValue(undefined),
  loadTxThresholds: async () => ({}),
}));
beforeEach(() => vi.clearAllMocks());
function setup() {
  const f = createTransactionalMemoryDb(),
    corp = { _id: new ObjectId(), countryId: "US" as const, liquidCurrencyCode: "USD" as const };
  const fund = {
    _id: new ObjectId(),
    name: "Synthetic",
    anchorCurrencyCode: "USD" as const,
    cashAnchor: 100,
    holdings: [{ corporationId: corp._id, shares: 10 }],
  };
  f.memory.seed("indexFunds", [{ ...fund }]);
  f.memory.seed("corporations", [{ ...corp }]);
  const bid = { fund, corp, shares: 5, limitPriceLocal: 10, fxRate: 1, turn: 100 };
  return { ...f, fund, corp, bid };
}
it("rolls back a published order and escrow debit when its receipt fails", async () => {
  const f = setup();
  vi.mocked(emitTx).mockRejectedValueOnce(new Error("interrupted fund escrow receipt"));
  await expect(placeFundShareBuyOrder(f.db, f.bid)).rejects.toThrow(
    "interrupted fund escrow receipt"
  );
  expect(f.memory.collection("indexFunds").docs[0].cashAnchor).toBe(100);
  expect(f.memory.collection("shareOrders").docs).toHaveLength(0);
  expect(f.memory.collection("indexFundTransactions").docs).toHaveLength(0);
  expect((await placeFundShareBuyOrder(f.db, f.bid)).ok).toBe(true);
  expect(f.memory.collection("indexFunds").docs[0].cashAnchor).toBe(50);
});
it("restores interrupted cancellation and refunds one remaining escrow on overlapping retries", async () => {
  const f = setup(),
    placed = await placeFundShareBuyOrder(f.db, f.bid);
  if (!placed.orderId) throw new Error("Order missing");
  vi.mocked(emitTx).mockRejectedValueOnce(new Error("interrupted fund refund receipt"));
  await expect(cancelFundShareOrder(f.db, placed.orderId, 100)).rejects.toThrow(
    "interrupted fund refund receipt"
  );
  expect(f.memory.collection("shareOrders").docs[0].status).toBe("open");
  expect(f.memory.collection("indexFunds").docs[0].cashAnchor).toBe(50);
  await Promise.all([0, 1].map(() => cancelFundShareOrder(f.db, placed.orderId!, 100)));
  expect(f.memory.collection("indexFunds").docs[0].cashAnchor).toBe(100);
});
it("reads current reservations instead of accepting a stale free-inventory hint", async () => {
  const f = setup();
  const input = {
    fund: f.fund,
    corp: f.corp,
    shares: 8,
    limitPriceLocal: 11,
    reservedOpenShares: 0,
  };
  const results = await Promise.all([
    placeFundShareSellOrder(f.db, input),
    placeFundShareSellOrder(f.db, input),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(f.memory.collection("shareOrders").docs).toHaveLength(1);
});
it("rolls back a partially inserted quote batch without publishing reservation caches", async () => {
  const f = setup(),
    orders = f.memory.collection("shareOrders"),
    original = orders.insertMany.bind(orders);
  vi.spyOn(orders, "insertMany").mockImplementationOnce(async (...args) => {
    await original(...args);
    throw new Error("interrupted quote batch");
  });
  const reserved = new Map<string, number>();
  const placements = [{ bid: f.bid, ask: { corp: f.corp, shares: 4, limitPriceLocal: 11 } }];
  await expect(placeFundQuotesBatch(f.db, f.fund, placements, reserved)).rejects.toThrow(
    "interrupted quote batch"
  );
  expect(f.memory.collection("indexFunds").docs[0].cashAnchor).toBe(100);
  expect(orders.docs).toHaveLength(0);
  expect(reserved.size).toBe(0);
  expect((await placeFundQuotesBatch(f.db, f.fund, placements, reserved))?.results[0].bid.ok).toBe(
    true
  );
  expect(f.memory.collection("indexFunds").docs[0].cashAnchor).toBe(50);
  expect(reserved.get(String(f.corp._id))).toBe(4);
});
it("refuses a resting bid in the issuer's former denomination", async () => {
  const f = setup();
  await f.memory
    .collection("corporations")
    .updateOne({ _id: f.corp._id }, { $set: { liquidCurrencyCode: "CAD" } });
  expect((await placeFundShareBuyOrder(f.db, f.bid)).ok).toBe(false);
  expect(f.memory.collection("indexFunds").docs[0].cashAnchor).toBe(100);
  expect(f.memory.collection("shareOrders").docs).toHaveLength(0);
});
