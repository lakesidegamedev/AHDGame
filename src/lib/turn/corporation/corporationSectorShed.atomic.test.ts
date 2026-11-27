import { describe, expect, it } from "vitest";
import { BSON, ObjectId } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CorporationLookups } from "./types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { shedSectorsForCorps } from "./corporationSectorShed";
function fixture() {
  const f = createTransactionalMemoryDb(),
    corporationId = new ObjectId();
  const corp = {
    _id: corporationId,
    liquidCapital: 5000,
    ceoId: null,
    ceoVacant: true,
  } as unknown as Corporation;
  const sector = {
    _id: new ObjectId(),
    corporationId,
    sectorType: "agriculture",
    strategyId: "traditional",
    plantsStartTurn: 1,
    capitalStock: 1000,
    capacityBookAnchor: 10000,
    workers: 100,
    revenue: 3000,
    producerInventory: {
      worldEpoch: "synthetic",
      turn: 99,
      inputStock: [{ commodity: "energy", units: 7, value: 70 }],
      outputStock: [{ commodity: "food", units: 20, book: "US:CA" }],
    },
    buildQueue: [{ unitsOrdered: 100, startTurn: 9, onlineTurn: 12, costPaidAnchor: 500 }],
  } as unknown as CorporateSector;
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 10, worldEpochId: "synthetic-shed" }]);
  f.memory.seed("corporations", [{ ...corp }]);
  f.memory.seed("corporateSectors", [{ ...sector }]);
  const lookups = () =>
    ({
      wholePlantsOn: false,
      sectorsByCorp: new Map([
        [String(corporationId), [BSON.deserialize(BSON.serialize(sector)) as CorporateSector]],
      ]),
    }) as CorporationLookups;
  return { ...f, corp, sector, lookups };
}
describe("physical CEO attrition proof", () => {
  it.each([
    { collection: "corporateSectors", op: "bulkWrite" as const },
    { collection: "bankMoneyMoves", op: "insertOne" as const },
  ])("rolls back landed $collection.$op without poisoning lookups", async (point) => {
    const { db, memory, corp, sector, lookups } = fixture(),
      view = lookups();
    const fault = withInjectedCrash(memory, { ...point, onCall: 1, afterWrite: true });
    await expect(
      shedSectorsForCorps(fault.db, view, [corp], 0.1, new Date(), "Vacant CEO", true, 11)
    ).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(view.sectorsByCorp.get(String(corp._id))![0].capitalStock).toBe(1000);
    expect(await db.collection("corporateSectors").findOne({})).toEqual(sector);
    const first = await shedSectorsForCorps(
      db,
      view,
      [corp],
      0.1,
      new Date(),
      "Vacant CEO",
      true,
      11
    );
    const after = await db.collection("corporateSectors").findOne({});
    expect(after!.capitalStock).toBe(900);
    expect(after!.capacityBookAnchor).toBe(9000);
    expect(after!.producerInventory).toEqual(sector.producerInventory);
    expect(after!.buildQueue).toEqual(sector.buildQueue);
    const restarted = lookups();
    expect(
      await shedSectorsForCorps(db, restarted, [corp], 0.1, new Date(), "Vacant CEO", true, 11)
    ).toEqual(first);
    expect(await db.collection("corporateSectors").findOne({})).toEqual(after);
    expect(restarted.sectorsByCorp.get(String(corp._id))![0].capitalStock).toBe(900);
  });
  it("two overlapping requests shed once", async () => {
    const { db, corp, lookups } = fixture();
    const args = [corp];
    const replies = await Promise.all([
      shedSectorsForCorps(db, lookups(), args, 0.1, new Date(), "Vacant CEO", true, 11),
      shedSectorsForCorps(db, lookups(), args, 0.1, new Date(), "Vacant CEO", true, 11),
    ]);
    expect(replies[0]).toEqual(replies[1]);
    expect((await db.collection("corporateSectors").findOne({}))!.capitalStock).toBe(900);
  });
});
