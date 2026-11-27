import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { settleSupplyAgreements, resumePendingSupplyProjections } from "./settleSupplyAgreements";
import { pendingSupplyCashPlans } from "./supplyAgreementPlan";
import type { CorporationLookups } from "./types";
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTxBulk: vi.fn(async (db: Db, rows: Record<string, unknown>[]) => {
    await db
      .collection("financialTxLog")
      .insertMany(rows.map((row) => ({ ...row, _id: new ObjectId() })));
  }),
}));
vi.mock("@/lib/notifications", () => ({ createNotifications: vi.fn(async () => {}) }));
function fixture() {
  const fixture = createTransactionalMemoryDb(),
    supplierId = new ObjectId(),
    buyerId = new ObjectId(),
    agreementId = new ObjectId();
  const supplier = {
    _id: supplierId,
    name: "Supplier",
    countryId: "US",
    liquidCurrencyCode: "USD",
    liquidCapital: 100000,
  };
  const buyer = {
    _id: buyerId,
    name: "Buyer",
    countryId: "CA",
    liquidCurrencyCode: "CAD",
    liquidCapital: 200000,
  };
  fixture.memory.seed("gameState", [{ _id: "current", currentTurn: 5 }]);
  fixture.memory.seed("corporations", [supplier, buyer]);
  fixture.memory.seed("supplyAgreements", [{ _id: agreementId }]);
  const lookups = {
    eraUnitScale: 1,
    exchangeRatesByCurrency: new Map([
      ["USD", 1],
      ["CAD", 2],
    ]),
    corpById: new Map([
      [supplierId.toString(), supplier],
      [buyerId.toString(), buyer],
    ]),
  } as unknown as CorporationLookups;
  const args = {
    db: fixture.db,
    lookups,
    agreements: [
      {
        agreementId: agreementId.toString(),
        supplierCorpId: supplierId.toString(),
        buyerCorpId: buyerId.toString(),
        commodity: "food" as const,
        volumeCap: 1000,
        pricePremium: 0.1,
      },
    ],
    contractSettlementByCorp: new Map([
      [supplierId.toString(), new Map([["food" as const, 1000]])],
    ]),
    priceRatioByCommodity: new Map([["food" as const, 1]]),
    turn: 5,
    now: new Date(0),
    thresholds: {} as never,
  };
  return { ...fixture, args, buyerId, supplierId, agreementId };
}
describe("supply agreement cash recovery", () => {
  it("rolls back cash and the frozen plan if the cash receipt acknowledgement is lost", async () => {
    const { memory, args } = fixture();
    const fault = withInjectedCrash(memory, {
      collection: "bankMoneyMoves",
      op: "insertOne",
      onCall: 1,
      afterWrite: true,
      matches: (args) => (args[0] as { phase?: string }).phase === "supply-agreement-cash",
    });
    await expect(settleSupplyAgreements({ ...args, db: fault.db })).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(memory.collection("corporations").docs.map((row) => row.liquidCapital)).toEqual([
      100000, 200000,
    ]);
    expect(memory.collection("bankMoneyMoves").docs).toHaveLength(0);
    expect((await settleSupplyAgreements({ ...args, db: fault.db })).settledCount).toBe(1);
    const [seller, buyer] = memory.collection("corporations").docs;
    expect(Number(seller.liquidCapital) + Number(buyer.liquidCapital) / 2).toBeCloseTo(200000, 8);
    expect(memory.collection("financialTxLog").docs).toHaveLength(2);
  });
  it.each(["delivery", "receipt"])(
    "replays an interrupted %s without moving cash again or using changed quotes",
    async (boundary) => {
      const { memory, args, buyerId, agreementId } = fixture();
      const fault = withInjectedCrash(
        memory,
        boundary === "delivery"
          ? { collection: "supplyAgreements", op: "bulkWrite", onCall: 1, afterWrite: true }
          : { collection: "financialTxLog", op: "insertMany", onCall: 1, afterWrite: true }
      );
      await expect(settleSupplyAgreements({ ...args, db: fault.db })).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      const before = memory.collection("corporations").docs.map((row) => Number(row.liquidCapital));
      expect(before[0]).toBeGreaterThan(100000);
      expect(memory.collection("financialTxLog").docs).toHaveLength(0);
      await memory
        .collection("corporations")
        .updateOne({ _id: buyerId }, { $inc: { liquidCapital: 50 } });
      args.lookups.exchangeRatesByCurrency.set("CAD", 20);
      const result = await settleSupplyAgreements({ ...args, db: fault.db });
      expect(result.settledCount).toBe(1);
      expect(
        memory.collection("corporations").docs.map((row) => Number(row.liquidCapital))
      ).toEqual([before[0], before[1] + 50]);
      expect(args.lookups.corpById.get(buyerId.toString())?.liquidCapital).toBe(before[1] + 50);
      expect(memory.collection("financialTxLog").docs).toHaveLength(2);
      expect(await pendingSupplyCashPlans(fault.db)).toEqual([]);
      expect(memory.collection("supplyAgreements").docs[0]).toMatchObject({
        _id: agreementId,
        lastDeliveryTurn: 5,
        lastDeliveredUnits: 1000,
      });
    }
  );
  it("recovers receipts on a later turn without recomputing or paying an inactive agreement again", async () => {
    const { memory, args } = fixture();
    const fault = withInjectedCrash(memory, {
      collection: "supplyAgreements",
      op: "bulkWrite",
      onCall: 1,
      afterWrite: true,
    });
    await expect(settleSupplyAgreements({ ...args, db: fault.db })).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    const balances = memory.collection("corporations").docs.map((row) => row.liquidCapital);
    memory.collection("gameState").docs[0].currentTurn = 6;
    await resumePendingSupplyProjections(fault.db, {} as never, new Date());
    expect(memory.collection("corporations").docs.map((row) => row.liquidCapital)).toEqual(
      balances
    );
    expect(memory.collection("financialTxLog").docs).toHaveLength(2);
    expect(memory.collection("financialTxLog").docs.every((row) => row.turn === 5)).toBe(true);
  });
});
