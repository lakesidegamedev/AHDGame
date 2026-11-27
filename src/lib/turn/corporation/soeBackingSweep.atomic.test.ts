import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { CorpSnapshot } from "./types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { runSoeBackingSweep } from "./soeBackingSweep";
const id = new ObjectId();
vi.mock("@/lib/nationalization/soeOperations", async (original) => ({
  ...(await original<typeof import("@/lib/nationalization/soeOperations")>()),
  processSoeOperations: async (db: import("mongodb").Db) => {
    await db.collection("corporations").updateOne({ _id: id }, { $inc: { liquidCapital: 100 } });
    await db
      .collection("federalBudget")
      .updateOne({ _id: "US" as never }, { $inc: { treasuryBalance: -100 } });
    await db.collection("macroMetrics").updateOne({ _id: "TX" as never }, { $inc: { health: 1 } });
    return {
      soeCorps: 1,
      backing: [
        {
          corpId: id,
          coveredLocal: 100,
          coveredAnchor: 100,
          shortfallAnchor: 100,
          realizedLossAnchor: 100,
          realizedSource: "snapshot",
          cipHeldAnchor: 0,
          residualAnchor: 0,
        },
      ],
    };
  },
}));
vi.mock("@/lib/nationalization/soeRemittance", () => ({
  processSoeRemittance: async () => ({ remitted: 0, perCorp: [] }),
}));
vi.mock("@/lib/nationalization/treasuryLedger", () => ({
  loadTreasuryCashContext: async () => ({}),
  withTreasuryCashBatch: async (
    _db: unknown,
    _context: unknown,
    work: (ledger: object) => unknown
  ) => work({}),
}));
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 10, worldEpochId: "synthetic-soe" }]);
  f.memory.seed("corporations", [{ _id: id, liquidCapital: -100 }]);
  f.memory.seed("federalBudget", [{ _id: "US", treasuryBalance: 1000 }]);
  f.memory.seed("macroMetrics", [{ _id: "TX", health: 50 }]);
  const snapshot = { corpId: id, income: -100, liquidCapital: -100 } as unknown as CorpSnapshot;
  const corp = { _id: id, liquidCapital: -100 } as unknown as Corporation;
  const args = {
    db: f.db,
    now: new Date(0),
    turn: 10,
    corpSnapshots: [snapshot],
    corpById: new Map([[id.toString(), corp]]),
    mark: vi.fn(),
  };
  return { ...f, args, snapshot, corp };
}
describe("SOE sweep completion and snapshot replay", () => {
  it.each(["corporations", "federalBudget", "macroMetrics", "bankMoneyMoves"])(
    "rolls back a landed %s write",
    async (collection) => {
      const f = fixture();
      const fault = withInjectedCrash(f.memory, { collection, onCall: 1, afterWrite: true });
      await expect(runSoeBackingSweep({ ...f.args, db: fault.db })).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect((await f.db.collection("corporations").findOne({}))!.liquidCapital).toBe(-100);
      expect((await f.db.collection("federalBudget").findOne({}))!.treasuryBalance).toBe(1000);
      expect(f.snapshot.liquidCapital).toBe(-100);
      const result = await runSoeBackingSweep(f.args);
      expect(await runSoeBackingSweep(f.args)).toEqual(result);
      expect(f.snapshot.liquidCapital).toBe(0);
      expect(f.corp.liquidCapital).toBe(0);
      expect((await f.db.collection("macroMetrics").findOne({}))!.health).toBe(51);
      expect((await f.db.collection("federalBudget").findOne({}))!.treasuryBalance).toBe(900);
    }
  );
  it("replays a fresh snapshot from current cash and never duplicates the transfer", async () => {
    const f = fixture();
    await Promise.all([runSoeBackingSweep(f.args), runSoeBackingSweep(f.args)]);
    await f.db.collection("corporations").updateOne({ _id: id }, { $inc: { liquidCapital: 25 } });
    f.snapshot.liquidCapital = 25;
    await runSoeBackingSweep(f.args);
    expect(f.snapshot.liquidCapital).toBe(25);
    expect(f.corp.liquidCapital).toBe(25);
    expect((await f.db.collection("federalBudget").findOne({}))!.treasuryBalance).toBe(900);
  });
});
