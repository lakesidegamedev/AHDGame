import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import {
  executeShareFillMoneyFlow,
  type ShareFillMoneyPlan,
} from "./commands/shareTrading/shareFillMoney";
import { convertCorpCurrency } from "./convertCorpCurrency";
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn(), emitTxBulk: vi.fn() }));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => true }));
function world() {
  const f = createTransactionalMemoryDb(),
    buyer = new ObjectId(),
    seller = new ObjectId(),
    issuer = new ObjectId();
  f.memory.seed("corporations", [
    { _id: buyer, countryId: "US", liquidCurrencyCode: "USD", liquidCapital: 100 },
    { _id: seller, countryId: "CA", liquidCurrencyCode: "CAD", liquidCapital: 0 },
    { _id: issuer, countryId: "US", totalShares: 10, shareholders: [] },
  ]);
  const plan: ShareFillMoneyPlan = {
    version: 1,
    fillKey: "frozen-wallet",
    orderIdHex: String(new ObjectId()),
    corpIdHex: String(issuer),
    direction: "listing-fill",
    shares: 10,
    turn: 5,
    nowIso: new Date().toISOString(),
    fillerDebit: {
      collection: "corporations",
      idHex: String(buyer),
      field: "liquidCapital",
      currencyCode: "USD",
      amount: 20,
    },
    fillerCredit: null,
    sellerProceeds: {
      collection: "corporations",
      idHex: String(seller),
      field: "liquidCapital",
      currencyCode: "CAD",
      amount: 28,
    },
    sellerDebit: null,
    buyerCredit: { field: "corporationId", idHex: String(buyer), pricePerShare: 1 },
    fundInventoryDebit: null,
    buyerHoldingsCredit: null,
  };
  return { ...f, buyer, seller, plan };
}
describe("frozen cash wallet denomination", () => {
  it("blocks currency conversion during interrupted payment and resumes the original quote once", async () => {
    const f = world(),
      fault = withInjectedCrash(f.memory, {
        collection: "corporations",
        op: "updateOne",
        onCall: 1,
        afterWrite: true,
        matches: (args) =>
          (args[1] as { $inc?: Record<string, number> }).$inc?.liquidCapital === -20,
      });
    await expect(executeShareFillMoneyFlow(fault.db, f.plan)).rejects.toThrow();
    const buyer = await f.db.collection<Corporation>("corporations").findOne({ _id: f.buyer });
    const moved = await convertCorpCurrency(
      f.db,
      buyer!,
      "CAD",
      new Map([
        ["USD", 2],
        ["CAD", 2.8],
      ]),
      new Date(),
      true
    );
    expect(moved).toMatchObject({ ok: false });
    expect(moved.ok ? "" : moved.error).toMatch(/frozen share/);
    await executeShareFillMoneyFlow(f.db, f.plan);
    await executeShareFillMoneyFlow(f.db, f.plan);
    expect(await f.db.collection("corporations").findOne({ _id: f.buyer })).toMatchObject({
      liquidCapital: 80,
      liquidCurrencyCode: "USD",
    });
    expect(await f.db.collection("corporations").findOne({ _id: f.seller })).toMatchObject({
      liquidCapital: 28,
      liquidCurrencyCode: "CAD",
    });
  });
  it("refuses a stale denomination before publishing a plan or debiting any cash", async () => {
    const f = world();
    await f.db
      .collection("corporations")
      .updateOne({ _id: f.buyer }, { $set: { liquidCurrencyCode: "CAD", liquidCapital: 140 } });
    await expect(executeShareFillMoneyFlow(f.db, f.plan)).rejects.toThrow(/currency changed/);
    expect(await f.db.collection("nonAtomicMoneyFlowReceipts").countDocuments({})).toBe(0);
    expect(await f.db.collection("corporations").findOne({ _id: f.buyer })).toMatchObject({
      liquidCapital: 140,
    });
  });
});
