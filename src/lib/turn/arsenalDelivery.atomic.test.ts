import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { applyDefenceRefit } from "./defenceRefitTurn";
import { applyNavalRepair } from "./navalRepairTurn";
function fixture(naval: boolean) {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 100, worldEpochId: "synthetic-arsenal" },
  ]);
  f.memory.seed("nationalArsenal", [
    {
      _id: new ObjectId(),
      countryId: "US",
      stock: { ground: 10000, naval: 10000, air: 0 },
      grade: { ground: 2, naval: 2 },
    },
  ]);
  f.memory.seed(
    "militaryUnits",
    Array.from({ length: 2 }, () => ({
      _id: new ObjectId(),
      countryId: "US",
      domain: naval ? "naval" : "ground",
      type: naval ? "Guided-Missile Destroyer" : "Infantry Division",
      integrity: 20,
      equipment: { firepower: 0, protection: 0, support: 0 },
    }))
  );
  return f;
}
describe.each([false, true])("atomic arsenal delivery: naval=%s", (naval) => {
  const run = naval ? applyNavalRepair : applyDefenceRefit;
  it.each([
    { collection: "nationalArsenal", op: "updateOne" as const },
    { collection: "militaryUnits", op: "bulkWrite" as const },
    { collection: "bankMoneyMoves", op: "insertOne" as const },
  ])("a landed $collection failure restores stock and both formations", async (point) => {
    const { db, memory } = fixture(naval);
    const beforeUnits = await db.collection("militaryUnits").find({}).toArray();
    const beforeStock = (await db.collection("nationalArsenal").findOne({}))?.stock;
    const fault = withInjectedCrash(memory, { ...point, onCall: 1, afterWrite: true });
    await expect(run(fault.db, "US", undefined, 100)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(await db.collection("militaryUnits").find({}).toArray()).toEqual(beforeUnits);
    expect((await db.collection("nationalArsenal").findOne({}))?.stock).toEqual(beforeStock);
    expect(await db.collection("bankMoneyMoves").countDocuments({})).toBe(0);
    const first = await run(db, "US", undefined, 100);
    expect(first.lotsUsed).toBeGreaterThan(0);
    const delivered = await db.collection("militaryUnits").find({}).toArray();
    const stock = (await db.collection("nationalArsenal").findOne({}))?.stock;
    expect(beforeStock[naval ? "naval" : "ground"] - stock[naval ? "naval" : "ground"]).toBe(
      first.lotsUsed
    );
    expect(await run(db, "US", undefined, 100)).toEqual(first);
    expect(await db.collection("militaryUnits").find({}).toArray()).toEqual(delivered);
    expect((await db.collection("nationalArsenal").findOne({}))?.stock).toEqual(stock);
  });
  it("overlapping passes settle one delivery and ignore stale preloaded unit values", async () => {
    const { db } = fixture(naval);
    const before = await db.collection("militaryUnits").find({}).toArray();
    await Promise.all([run(db, "US", before as never, 100), run(db, "US", before as never, 100)]);
    expect(
      await db.collection("bankMoneyMoves").countDocuments({ kind: "turn-value-settlement" })
    ).toBe(1);
    const stock = (await db.collection("nationalArsenal").findOne({}))?.stock;
    await run(db, "US", before as never, 101);
    expect((await db.collection("nationalArsenal").findOne({}))?.stock).toEqual(stock);
  });
});
