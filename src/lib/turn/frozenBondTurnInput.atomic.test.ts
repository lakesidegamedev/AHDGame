import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { frozenBondTurnInput, settleBondTurnBatches } from "./frozenBondTurnInput";
describe("frozen bond cash stages", () => {
  it("retains original holder claims after retirement and commits a cash chunk once", async () => {
    const f = createTransactionalMemoryDb(),
      id = new ObjectId();
    f.memory.seed("gameState", [{ _id: "current", resetWorldId: "bond-test" }]);
    f.memory.seed("bonds", [{ _id: id, matured: false, holders: [{ units: 9 }], publicFloat: 1 }]);
    f.memory.seed("corporations", [{ _id: id, liquidCapital: 100 }]);
    const load = (db = f.db) =>
      frozenBondTurnInput(db, "bonds", 10, (tx) =>
        tx.collection("bonds").find({ matured: false }).toArray()
      );
    const original = await load();
    await f.db
      .collection("bonds")
      .updateOne({ _id: id }, { $set: { matured: true, holders: [], publicFloat: 0 } });
    expect(await load()).toEqual(original);
    const pay = (db = f.db) =>
      settleBondTurnBatches(db, "test", 10, [25], (tx, amounts) =>
        tx
          .collection("corporations")
          .updateOne({ _id: id }, { $inc: { liquidCapital: -amounts[0] } })
      );
    const crash = withInjectedCrash(f.memory, {
      collection: "corporations",
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(pay(crash.db)).rejects.toThrow();
    expect((await f.db.collection("corporations").findOne({ _id: id }))?.liquidCapital).toBe(100);
    await Promise.all([pay(), pay()]);
    await pay();
    expect((await f.db.collection("corporations").findOne({ _id: id }))?.liquidCapital).toBe(75);
  });
});
