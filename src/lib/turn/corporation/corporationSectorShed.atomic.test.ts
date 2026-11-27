import { describe, expect, it } from "vitest";
import { BSON, ObjectId } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CorporationLookups } from "./types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { applyPlantChange } from "@/lib/corporations/wholePlants/rules";
import { plantSizeForSector } from "@/lib/constants/facilityQuantum";
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

  it.each([
    {
      wholePlantsOn: true,
      wear: 0,
      expectedStock: 960,
      expectedCount: 16,
      expectedRemainder: 0,
      expectedWear: 9.6,
      expectedBook: 10000,
      workers: 0,
    },
    {
      wholePlantsOn: true,
      wear: 55,
      expectedStock: 900,
      expectedCount: 15,
      expectedRemainder: 0,
      expectedWear: 4.6,
      expectedBook: 9375,
      workers: 100,
    },
    {
      wholePlantsOn: false,
      wear: 7,
      expectedStock: 950.4,
      expectedCount: 15,
      expectedRemainder: 50.4,
      expectedWear: 7,
      expectedBook: 9900,
      workers: 100,
    },
  ])("records and replays the complete plant ledger: %j", async (scenario) => {
    const f = fixture();
    await f.db.collection("corporateSectors").updateOne(
      { _id: f.sector._id },
      {
        $set: {
          capitalStock: 960,
          plantCount: 16,
          plantUnitRemainder: 0,
          plantWearUnits: scenario.wear,
          workers: scenario.workers,
        },
      }
    );
    const view = async () =>
      ({
        wholePlantsOn: scenario.wholePlantsOn,
        sectorsByCorp: new Map([
          [
            String(f.corp._id),
            [await f.db.collection("corporateSectors").findOne({ _id: f.sector._id })],
          ],
        ]),
      }) as unknown as CorporationLookups;
    const ledger = {
      capitalStock: scenario.expectedStock,
      plantCount: scenario.expectedCount,
      plantUnitRemainder: scenario.expectedRemainder,
      plantWearUnits: scenario.expectedWear,
      capacityBookAnchor: scenario.expectedBook,
    };
    const expectLedger = (actual: unknown) => {
      expect(actual).toBeTruthy();
      for (const [key, value] of Object.entries(ledger))
        expect((actual as Record<string, number>)[key]).toBeCloseTo(value, 10);
    };
    const firstView = await view();
    const first = await shedSectorsForCorps(
      f.db,
      firstView,
      [f.corp],
      0.01,
      new Date(0),
      "Vacant CEO",
      true,
      11
    );
    const committed = await f.db.collection("corporateSectors").findOne({ _id: f.sector._id });
    expectLedger(committed);
    expectLedger(firstView.sectorsByCorp.get(String(f.corp._id))![0]);
    const receipt = await f.db.collection("bankMoneyMoves").findOne({ phase: "vacant-ceo-shed" });
    expectLedger(receipt?.result.sectors[0]);
    const replays = [await view(), await view()];
    expect(
      await Promise.all(
        replays.map((replay) =>
          shedSectorsForCorps(f.db, replay, [f.corp], 0.01, new Date(0), "Vacant CEO", true, 11)
        )
      )
    ).toEqual([first, first]);
    for (const replay of replays) {
      const sector = replay.sectorsByCorp.get(String(f.corp._id))![0];
      expectLedger(sector);
      if (scenario.wholePlantsOn && scenario.wear === 0) {
        expect(
          applyPlantChange(
            {
              capitalStock: sector.capitalStock,
              plantUnitRemainder: sector.plantUnitRemainder,
              plantWearUnits: sector.plantWearUnits,
            },
            plantSizeForSector(sector),
            { lossUnits: 50.4 }
          )
        ).toMatchObject({ capitalStock: 900, plantCount: 15, plantsRemoved: 1, plantWearUnits: 0 });
      }
    }
    expect(await f.db.collection("corporateSectors").findOne({ _id: f.sector._id })).toEqual(
      committed
    );
    expect(committed?.producerInventory).toEqual(f.sector.producerInventory);
    expect(committed?.buildQueue).toEqual(f.sector.buildQueue);
    expect(
      (await f.db.collection("corporations").findOne({ _id: f.corp._id }))?.liquidCapital
    ).toBe(5000);
  });
  it.each([
    { collection: "corporateSectors", op: "bulkWrite" as const },
    { collection: "bankMoneyMoves", op: "insertOne" as const },
  ])("whole-plant wear rolls back a landed $collection.$op before retry", async (point) => {
    const f = fixture();
    const originalLedger = {
      capitalStock: 960,
      plantCount: 16,
      plantUnitRemainder: 0,
      plantWearUnits: 55,
    };
    await f.db
      .collection("corporateSectors")
      .updateOne({ _id: f.sector._id }, { $set: originalLedger });
    const view = f.lookups();
    view.wholePlantsOn = true;
    Object.assign(view.sectorsByCorp.get(String(f.corp._id))![0], originalLedger);
    const fault = withInjectedCrash(f.memory, { ...point, onCall: 1, afterWrite: true });
    await expect(
      shedSectorsForCorps(fault.db, view, [f.corp], 0.01, new Date(0), "Inactive CEO", true, 11)
    ).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(view.sectorsByCorp.get(String(f.corp._id))![0]).toMatchObject(originalLedger);
    expect(await f.db.collection("corporateSectors").findOne({ _id: f.sector._id })).toMatchObject(
      originalLedger
    );
    await shedSectorsForCorps(f.db, view, [f.corp], 0.01, new Date(0), "Inactive CEO", true, 11);
    const published = view.sectorsByCorp.get(String(f.corp._id))![0];
    expect(published).toMatchObject({
      capitalStock: 900,
      plantCount: 15,
      plantUnitRemainder: 0,
      capacityBookAnchor: 9375,
    });
    expect(published.plantWearUnits).toBeCloseTo(4.6, 10);
    const committed = await f.db.collection("corporateSectors").findOne({ _id: f.sector._id });
    expect(committed).toMatchObject({
      capitalStock: 900,
      plantCount: 15,
      plantUnitRemainder: 0,
      capacityBookAnchor: 9375,
    });
    expect(committed?.plantWearUnits).toBeCloseTo(4.6, 10);
  });
});
