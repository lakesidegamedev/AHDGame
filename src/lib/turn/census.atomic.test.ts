import { describe, expect, it } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { runCensus } from "./census";
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 144,
      currentYear: 2030,
      worldEpochId: "synthetic",
      preset: "2027-default",
    },
  ]);
  f.memory.seed("states", [
    { _id: "TX", countryId: "US", population: 3000000, houseDistricts: 38 },
    { _id: "CA", countryId: "US", population: 2000000, houseDistricts: 52 },
  ]);
  f.memory.seed("congressionalDistricts", [
    { _id: "US_TX_1", countryId: "US", stateId: "TX", index: 1 },
  ]);
  return f;
}
describe("census district publication", () => {
  it.each(["states", "congressionalDistricts", "gameState", "newsPosts", "bankMoneyMoves"])(
    "recovers a landed %s failure with original seat deltas",
    async (collection) => {
      const { db, memory } = fixture();
      const fault = withInjectedCrash(memory, { collection, onCall: 1, afterWrite: true });
      await expect(runCensus(fault.db, 144, 2030)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(memory.collection("states").docs.map((row) => row.houseDistricts)).toEqual([38, 52]);
      expect(await db.collection("congressionalDistricts").countDocuments({})).toBe(1);
      expect(memory.collection("gameState").docs[0].lastCensusYear).toBeUndefined();
      const first = await runCensus(db, 144, 2030);
      expect(first.ran).toBe(true);
      expect(first.deltas?.map((delta) => delta.from)).toEqual([38, 52]);
      expect(await runCensus(db, 144, 2030)).toEqual(first);
      expect(await db.collection("congressionalDistricts").countDocuments({})).toBe(435);
      expect(await db.collection("newsPosts").countDocuments({})).toBe(1);
    }
  );
  it("overlapping passes publish one census and district map", async () => {
    const { db } = fixture();
    const replies = await Promise.all([runCensus(db, 144, 2030), runCensus(db, 144, 2030)]);
    expect(replies[0]).toEqual(replies[1]);
    expect(await db.collection("congressionalDistricts").countDocuments({})).toBe(435);
    expect(await db.collection("newsPosts").countDocuments({})).toBe(1);
  });
});
