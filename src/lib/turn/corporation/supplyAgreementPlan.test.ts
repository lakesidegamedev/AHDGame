import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import {
  prepareSupplyCashPlan,
  pendingSupplyCashPlans,
  replaySupplyPlan,
} from "./supplyAgreementPlan";
import type { SupplyAgreementSettlements } from "./settleSupplyAgreementsAllocation";

function fixture() {
  const fixture = createTransactionalMemoryDb();
  fixture.memory.seed("gameState", [{ _id: "current", currentTurn: 5 }]);
  fixture.memory.seed("corporations", [
    { _id: "buyer", liquidCapital: 1000 },
    { _id: "seller", liquidCapital: 0 },
  ]);
  fixture.memory.seed("projectionCount", [{ _id: "all", count: 0 }]);
  return fixture;
}
function plan(): SupplyAgreementSettlements & {
  cashClosings: { corporationId: string; balance: number }[];
} {
  return {
    deltaByCorp: new Map([
      ["buyer", -100],
      ["seller", 100],
    ]),
    txEntries: [],
    settledCount: 2500,
    totalPremiumAnchor: 100,
    settledPremiums: [],
    damages: [],
    deliveries: Array.from({ length: 2500 }, () => ({
      agreementId: new ObjectId().toString(),
      supplierCorpId: "seller",
      buyerCorpId: "buyer",
      commodity: "food",
      contractedUnits: 1,
      deliveredUnits: 1,
      turn: 5,
    })),
    cashClosings: [
      { corporationId: "buyer", balance: 900 },
      { corporationId: "seller", balance: 100 },
    ],
  };
}
describe("frozen supply cash and bounded receipt tails", () => {
  it("restores cash if plan storage fails, and never recomputes a committed plan", async () => {
    const { memory } = fixture();
    const fault = withInjectedCrash(memory, {
      collection: "bankMoneyMoves",
      op: "insertMany",
      onCall: 1,
      afterWrite: true,
    });
    let prepared = 0;
    const run = () =>
      prepareSupplyCashPlan(fault.db, 5, new Date(0), async (db) => {
        prepared++;
        await db
          .collection<{ _id: string; liquidCapital: number }>("corporations")
          .updateOne({ _id: "buyer" }, { $inc: { liquidCapital: -100 } });
        await db
          .collection<{ _id: string; liquidCapital: number }>("corporations")
          .updateOne({ _id: "seller" }, { $inc: { liquidCapital: 100 } });
        return plan();
      });
    await expect(run()).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(memory.collection("corporations").docs.map((row) => row.liquidCapital)).toEqual([
      1000, 0,
    ]);
    expect(memory.collection("bankMoneyMoves").docs).toHaveLength(0);
    const manifest = await run();
    expect(manifest.chunkKeys).toHaveLength(3);
    expect(memory.collection("corporations").docs.map((row) => row.liquidCapital)).toEqual([
      900, 100,
    ]);
    expect(await run()).toEqual(manifest);
    expect(prepared).toBe(2);
    expect(memory.collection("corporations").docs.map((row) => row.liquidCapital)).toEqual([
      900, 100,
    ]);
  });
  it("retries only unfinished projection chunks and retains discoverable older tails", async () => {
    const { db, memory } = fixture();
    const manifest = await prepareSupplyCashPlan(db, 5, new Date(0), async () => plan());
    const fault = withInjectedCrash(memory, {
      collection: "bankMoneyMoves",
      op: "insertOne",
      onCall: 2,
      afterWrite: true,
      matches: (args) => (args[0] as { phase?: string }).phase === "supply-agreement-projection",
    });
    const apply: Parameters<typeof replaySupplyPlan>[2] = async (db, part) => {
      await db
        .collection<{ _id: string; count: number }>("projectionCount")
        .updateOne({ _id: "all" }, { $inc: { count: part.deliveries.length } });
    };
    await expect(replaySupplyPlan(fault.db, manifest, apply)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(memory.collection("projectionCount").docs[0].count).toBe(1024);
    expect(await pendingSupplyCashPlans(db)).toEqual([manifest]);
    await replaySupplyPlan(fault.db, manifest, apply);
    expect(memory.collection("projectionCount").docs[0].count).toBe(2500);
    expect(await pendingSupplyCashPlans(db)).toEqual([]);
    await replaySupplyPlan(fault.db, manifest, apply);
    expect(memory.collection("projectionCount").docs[0].count).toBe(2500);
  });
});
