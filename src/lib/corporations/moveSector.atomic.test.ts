import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { moveSectorToCorp } from "./moveSector";
function fixture() {
  const f = createTransactionalMemoryDb(),
    source = new ObjectId(),
    dest = new ObjectId();
  f.memory.seed("gameConfig", [{ _id: "default", marketSystemMode: "plants" }]);
  const fields = {
    stateId: "CA",
    countryId: "US",
    sectorType: "agriculture",
    strategyId: "traditional",
    plantsStartTurn: 1,
    workers: 10,
    revenue: 100,
    currentGrowthCost: 200,
    capitalStock: 100,
    capacityBookAnchor: 1000,
    buildQueue: [{ unitsOrdered: 10, costPaidAnchor: 100, startTurn: 1, onlineTurn: 12 }],
    producerInventory: {
      worldEpoch: "synthetic",
      turn: 10,
      inputStock: [{ commodity: "energy", units: 2, value: 20 }],
      outputStock: [{ commodity: "food", units: 3, book: "US:CA" }],
    },
  };
  const donor = { _id: new ObjectId(), corporationId: source, ...fields },
    survivor = { _id: new ObjectId(), corporationId: dest, ...fields };
  f.memory.seed("corporateSectors", [donor, survivor]);
  return { ...f, donor, survivor, dest };
}
describe("consensual sector merge property conservation", () => {
  it.each(["updateOne", "deleteOne"] as const)(
    "retries after landed %s without losing or duplicating property",
    async (op) => {
      const { db, memory, donor, survivor, dest } = fixture(),
        fault = withInjectedCrash(memory, {
          collection: "corporateSectors",
          op,
          onCall: 1,
          afterWrite: true,
        });
      const move = (database: typeof db) =>
        moveSectorToCorp(
          database,
          donor as unknown as CorporateSector,
          dest,
          "CAD",
          1.4,
          "USD",
          1,
          new Date(0)
        );
      await expect(move(fault.db)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(await db.collection("corporateSectors").countDocuments({})).toBe(2);
      expect(await db.collection("corporateSectors").findOne({ _id: survivor._id })).toEqual(
        survivor
      );
      await move(db);
      const merged = await db.collection("corporateSectors").findOne({ _id: survivor._id });
      expect(merged).toMatchObject({ capitalStock: 200, capacityBookAnchor: 2000 });
      expect(merged!.buildQueue).toHaveLength(2);
      expect(
        merged!.buildQueue.reduce(
          (sum: number, o: { costPaidAnchor: number }) => sum + o.costPaidAnchor,
          0
        )
      ).toBe(200);
      expect(
        merged!.producerInventory.inputStock.reduce(
          (sum: number, r: { units: number }) => sum + r.units,
          0
        )
      ).toBe(4);
      expect(
        merged!.producerInventory.outputStock.reduce(
          (sum: number, r: { units: number }) => sum + r.units,
          0
        )
      ).toBe(6);
      expect(await db.collection("corporateSectors").countDocuments({})).toBe(1);
      await expect(move(db)).rejects.toThrow("no longer exists");
      expect(await db.collection("corporateSectors").findOne({})).toEqual(merged);
    }
  );
  it("two source moves cannot fold the same stock twice", async () => {
    const { db, donor, dest } = fixture();
    const run = () =>
      moveSectorToCorp(
        db,
        donor as unknown as CorporateSector,
        dest,
        "USD",
        1,
        "USD",
        1,
        new Date(0)
      );
    const result = await Promise.allSettled([run(), run()]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.collection("corporateSectors").findOne({}))!.capitalStock).toBe(200);
  });
});
