import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { topUpOfficePool, OFFICE_POOL_TOP_UP_AP_COST } from "./officePoolTopUp";
const actor = new ObjectId();
const target = { kind: "vp", countryId: "US" } as const;
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 100, isProcessing: false }]);
  f.memory.seed("characters", [{ _id: actor, actions: 30, cash: 1000 }]);
  f.memory.seed("electedOfficials", [
    {
      _id: new ObjectId(),
      characterId: actor,
      countryId: "US",
      officeType: "vicePresident",
      vpActionsRemaining: 0,
    },
  ]);
  return f;
}
describe("office resource conversion atomicity", () => {
  it.each(["characters", "electedOfficials"])(
    "a landed %s write failure restores both resources",
    async (collection) => {
      const { db, memory } = fixture();
      const fault = withInjectedCrash(memory, {
        collection,
        op: "findOneAndUpdate",
        onCall: 1,
        afterWrite: true,
      });
      await expect(topUpOfficePool(fault.db, actor, target, 100)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect((await db.collection("characters").findOne({}))?.actions).toBe(30);
      expect((await db.collection("electedOfficials").findOne({}))?.vpActionsRemaining).toBe(0);
      expect(await topUpOfficePool(db, actor, target, 100)).toMatchObject({
        ok: true,
        remaining: 1,
      });
      expect((await db.collection("characters").findOne({}))?.actions).toBe(
        30 - OFFICE_POOL_TOP_UP_AP_COST
      );
    }
  );
  it("overlapping requests publish one conversion", async () => {
    const { db } = fixture();
    const results = await Promise.all([
      topUpOfficePool(db, actor, target, 100),
      topUpOfficePool(db, actor, target, 100),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await db.collection("characters").findOne({}))?.actions).toBe(
      30 - OFFICE_POOL_TOP_UP_AP_COST
    );
    expect((await db.collection("characters").findOne({}))?.cash).toBe(1000);
  });
  it("rejects a running turn, stale caller turn, or future top-up marker without spending AP", async () => {
    const { db } = fixture();
    await db.collection("gameState").updateOne({}, { $set: { isProcessing: true } });
    expect(await topUpOfficePool(db, actor, target, 100)).toMatchObject({ ok: false, status: 409 });
    await db.collection("gameState").updateOne({}, { $set: { isProcessing: false } });
    expect(await topUpOfficePool(db, actor, target, 99)).toMatchObject({ ok: false, status: 409 });
    await db.collection("electedOfficials").updateOne({}, { $set: { lastVpActionTopUpTurn: 101 } });
    expect(await topUpOfficePool(db, actor, target, 100)).toMatchObject({ ok: false, status: 409 });
    expect((await db.collection("characters").findOne({}))?.actions).toBe(30);
  });
});
