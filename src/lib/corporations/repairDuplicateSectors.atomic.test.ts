import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { normalizeAndMergeCorporateSectors } from "./repairDuplicateSectors";
function fixture() {
  const f = createTransactionalMemoryDb();
  const corporationId = new ObjectId();
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 10, isProcessing: false, worldEpochId: "synthetic" },
  ]);
  f.memory.seed("states", [{ _id: "TX", countryId: "US" }]);
  f.memory.seed("corporations", [{ _id: corporationId, liquidCapital: 1000 }]);
  const rows = [1, 2].map((n) => ({
    _id: new ObjectId(),
    corporationId,
    countryId: "US",
    stateId: "TX",
    sectorType: "agriculture",
    strategyId: "traditional",
    revenue: 100 * n,
    workers: 10 * n,
    profitMargin: 20,
    capitalStock: 100 * n,
    plantCount: n,
    capacityBookAnchor: 1000 * n,
    buildQueue: [
      { id: `paid-${n}`, units: 100, completesTurn: 11, startedTurn: 9, costPaidAnchor: 500 * n },
    ],
    producerInventory: {
      worldEpoch: "synthetic",
      turn: 10,
      inputStock: [{ commodity: "energy", units: n, value: 10 * n }],
      outputStock: [],
    },
  }));
  f.memory.seed("corporateSectors", rows);
  return f;
}
describe("duplicate sector repair atomicity", () => {
  it.each(["updateOne", "deleteMany"] as const)(
    "a landed %s cannot duplicate or destroy physical assets",
    async (op) => {
      const { db, memory } = fixture();
      const fault = withInjectedCrash(memory, {
        collection: "corporateSectors",
        op,
        onCall: op === "updateOne" ? 3 : 1,
        afterWrite: true,
      });
      await expect(normalizeAndMergeCorporateSectors(fault.db)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(memory.collection("corporateSectors").docs).toHaveLength(2);
      expect(
        memory
          .collection("corporateSectors")
          .docs.reduce((n, row) => n + Number(row.capacityBookAnchor), 0)
      ).toBe(3000);
      await normalizeAndMergeCorporateSectors(db);
      const rows = await db.collection("corporateSectors").find({}).toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        capacityBookAnchor: 3000,
        capitalStock: 300,
        strategyId: "traditional",
      });
      expect(
        rows[0].buildQueue.reduce(
          (n: number, row: { costPaidAnchor: number }) => n + row.costPaidAnchor,
          0
        )
      ).toBe(1500);
      expect(
        rows[0].producerInventory.inputStock.reduce(
          (n: number, row: { value: number }) => n + row.value,
          0
        )
      ).toBe(30);
      expect((await db.collection("corporations").findOne({}))?.liquidCapital).toBe(1000);
      expect((await normalizeAndMergeCorporateSectors(db)).mergedGroups).toHaveLength(0);
    }
  );
  it("keeps incompatible methods and live-turn worlds intact", async () => {
    const { db, memory } = fixture();
    memory.collection("corporateSectors").docs[1].strategyId = "organic";
    expect((await normalizeAndMergeCorporateSectors(db)).mergedGroups).toHaveLength(0);
    expect(await db.collection("corporateSectors").countDocuments({})).toBe(2);
    memory.collection("gameState").docs[0].isProcessing = true;
    await expect(normalizeAndMergeCorporateSectors(db)).rejects.toThrow("processing");
    expect(await db.collection("corporateSectors").countDocuments({})).toBe(2);
  });
});
