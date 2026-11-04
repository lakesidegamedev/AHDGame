import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import type { UnownedSector } from "@/lib/db/types/unownedSector";
import type { PlacementSignals } from "@/lib/turn/npp/marketSignals";
import { liftStateServiceHeadroom } from "./stateServiceHeadroomShell";

function pool(stateId: string, sectorType: string, headroomUnits: number): UnownedSector {
  return {
    stateId,
    countryId: "US",
    sectorType,
    industryModel: null,
    mediaDiscriminator: null,
    revenue: 0,
    headroomUnits,
  } as unknown as UnownedSector;
}

function fakeDb(queued: unknown[], reads: { count: number }): Db {
  return {
    collection: () => ({
      find: () => ({
        toArray: async () => {
          reads.count += 1;
          return queued;
        },
      }),
    }),
  } as unknown as Db;
}

describe("liftStateServiceHeadroom", () => {
  it("lifts local service pools to unmet demand less in-flight builds and leaves others alone", async () => {
    const ca = pool("CA", "healthcare", 0);
    const nj = pool("NJ", "healthcare", 3_051);
    const caMfg = pool("CA", "manufacturing", 0);
    const caLogistics = pool("CA", "logistics", 0);
    const signals: PlacementSignals = {
      unmetDemandUnitsOf: (cell) => (cell.stateId === "CA" ? 13_486 : 1_000),
    } as PlacementSignals;
    const reads = { count: 0 };
    const lifted = await liftStateServiceHeadroom(
      fakeDb(
        [
          {
            stateId: "CA",
            sectorType: "healthcare",
            industryModel: null,
            mediaDiscriminator: null,
            buildQueue: [{ unitsOrdered: 5_000 }, { unitsOrdered: 5 }],
          },
        ],
        reads
      ),
      new Map([["US", [ca, nj, caMfg, caLogistics]]]),
      signals,
      1
    );
    expect(reads.count).toBe(1);
    expect(lifted).toBe(1);
    expect(ca.headroomUnits).toBe(8_481);
    expect(nj.headroomUnits).toBe(3_051);
    expect(caMfg.headroomUnits).toBe(0);
    expect(caLogistics.headroomUnits).toBe(0);
  });

  it("reads nothing without a demand signal", async () => {
    const reads = { count: 0 };
    const ca = pool("CA", "healthcare", 0);
    const lifted = await liftStateServiceHeadroom(
      fakeDb([], reads),
      new Map([["US", [ca]]]),
      {} as PlacementSignals,
      1
    );
    expect(lifted).toBe(0);
    expect(reads.count).toBe(0);
    expect(ca.headroomUnits).toBe(0);
  });
});
