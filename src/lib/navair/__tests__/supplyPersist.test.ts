import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Db } from "mongodb";
import { processNavairTurn } from "../turn";

/** A stale stored supply must be written even when nothing else about the formation changed. */

const unitDocs: Record<string, unknown>[] = [];
let writtenIds: string[] = [];

function mockDb(): Db {
  const col = (name: string) => {
    if (name === "conflicts") return { find: () => ({ toArray: async () => [] }) };
    if (name === "militaryUnits") {
      return {
        find: () => ({ toArray: async () => unitDocs.map((d) => ({ ...d })) }),
        bulkWrite: async (
          ops: {
            updateOne: { filter: { _id: string }; update: { $set: Record<string, unknown> } };
          }[]
        ) => {
          for (const op of ops) {
            writtenIds.push(op.updateOne.filter._id);
            const doc = unitDocs.find((d) => d._id === op.updateOne.filter._id);
            if (doc) Object.assign(doc, op.updateOne.update.$set);
          }
          return { modifiedCount: ops.length };
        },
      };
    }
    const emptyCursor = { toArray: async () => [] };
    return {
      find: () => ({ ...emptyCursor, project: () => emptyCursor }),
      findOne: async () => null,
      bulkWrite: async () => ({ modifiedCount: 0 }),
      insertMany: async () => ({ insertedCount: 0 }),
    };
  };
  return { collection: vi.fn().mockImplementation(col) } as unknown as Db;
}

const wing = (over: Record<string, unknown>) => ({
  _id: "wing-1",
  countryId: "UK",
  domain: "air",
  branchId: "air_force",
  type: "Fighter Wing",
  name: "1st Test Wing",
  icon: "plane",
  posture: "standard",
  techTier: 1,
  personnel: 1000,
  readiness: 70,
  basePower: 90,
  upkeepBase: 100,
  vet: 1,
  xp: 0,
  equipment: { firepower: 1, protection: 1, support: 1 },
  drill: null,
  theaterId: "reserve",
  assignedGeneralId: null,
  createdTurn: 1,
  integrity: 100,
  supply: 100,
  mission: "STANDDOWN",
  station: "weu",
  stationSetByPlayer: true,
  ...over,
});

beforeEach(() => {
  unitDocs.length = 0;
  writtenIds = [];
});

describe("processNavairTurn supply persistence", () => {
  it("writes a stale supply on an otherwise unchanged home wing", async () => {
    unitDocs.push(wing({ supply: 10 }));

    await processNavairTurn(mockDb(), 100);

    expect(writtenIds).toEqual(["wing-1"]);
    expect(unitDocs[0].supply as number).toBeGreaterThan(10);
  });

  it("does not write a formation whose stored supply already matches", async () => {
    unitDocs.push(wing({ supply: 10 }));
    await processNavairTurn(mockDb(), 100);
    writtenIds = [];

    await processNavairTurn(mockDb(), 101);

    expect(writtenIds).toEqual([]);
  });
});
