import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { releaseCharacterHeldIndexFundPositionsToFloat as release } from "./releaseCharacterHeldPositionsToFloat";
const characterId = new ObjectId(),
  fundId = new ObjectId();
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("indexFunds", [{ _id: fundId, cashAnchor: 1000, unitSupply: 100, quotedNav: 10 }]);
  f.memory.seed("indexFundPositions", [
    {
      _id: new ObjectId(),
      fundId,
      holderKind: "character",
      characterId,
      units: 10,
      avgNavAnchor: 5,
    },
  ]);
  return f;
}
describe("abandoned fund position conservation", () => {
  it.each(["findOneAndUpdate", "deleteOne", "insertOne"] as const)(
    "recovers a landed %s without losing the claim",
    async (op) => {
      const { db, memory } = fixture();
      const fault = withInjectedCrash(memory, {
        collection: "indexFundPositions",
        op,
        onCall: 1,
        afterWrite: true,
      });
      await expect(release(fault.db, [characterId])).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(await db.collection("indexFundPositions").find({}).toArray()).toEqual([
        expect.objectContaining({ holderKind: "character", units: 10 }),
      ]);
      expect(await release(db, [characterId])).toEqual({ unitsReleased: 10, positionsReleased: 1 });
      expect(await release(db, [characterId])).toEqual({ unitsReleased: 0, positionsReleased: 0 });
      expect(await db.collection("indexFundPositions").find({}).toArray()).toEqual([
        expect.objectContaining({ holderKind: "fund_reserve", units: 10 }),
      ]);
      expect(await db.collection("indexFunds").findOne({})).toMatchObject({
        cashAnchor: 1000,
        unitSupply: 100,
      });
    }
  );
  it("overlapping releases move one claim; a missing fund keeps the original position", async () => {
    const { db } = fixture();
    const replies = await Promise.all([release(db, [characterId]), release(db, [characterId])]);
    expect(replies.reduce((n, r) => n + r.unitsReleased, 0)).toBe(10);
    const second = fixture();
    await second.db.collection("indexFunds").deleteMany({});
    await expect(release(second.db, [characterId])).rejects.toThrow("fund valuation");
    expect((await second.db.collection("indexFundPositions").findOne({}))?.units).toBe(10);
  });
});
