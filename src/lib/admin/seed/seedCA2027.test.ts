import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { seedCA2027, seedsCanada, writeCA2027 } from "./seedCA2027";
import { tierFor } from "@/lib/world/eraRoster";
import { caParties } from "@/lib/countries/ca/data/caParties";

interface Recorded {
  bulkWrite: ReturnType<typeof vi.fn>;
  updateOne: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
}

/** Records writes per collection; politicalParties reads back what was inserted. */
function recordingDb() {
  const calls: Record<string, Recorded> = {};
  let partySeq = 0;
  const inserted: Array<{ name: string; sequentialId: number; isDefault: boolean }> = [];
  const collection = (name: string) => {
    calls[name] ??= {
      bulkWrite: vi.fn(async (ops: Array<{ insertOne?: { document: never } }>) => {
        if (name === "politicalParties")
          for (const op of ops) if (op.insertOne) inserted.push(op.insertOne.document);
        return {};
      }),
      updateOne: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    const cursor = (rows: () => unknown[]) => {
      const chain = {
        project: () => chain,
        toArray: async () => rows(),
      };
      return chain;
    };
    return {
      ...calls[name],
      find: () => cursor(() => (name === "politicalParties" ? inserted : [])),
      findOneAndUpdate: vi.fn(async (_filter: unknown, update: { $inc: { seq: number } }) => {
        partySeq += update.$inc.seq;
        return { seq: partySeq };
      }),
    };
  };
  return { db: { collection } as unknown as Db, calls };
}

describe("seedCA2027", () => {
  it("ships dark until the 2027 roster includes Canada", async () => {
    expect(seedsCanada("2027-default")).toBe(tierFor("2027-default", "CA") !== "absent");
    expect(seedsCanada("1991-default")).toBe(false);
    const { db, calls } = recordingDb();
    await seedCA2027(db, true, () => {}, "1991-default");
    expect(Object.keys(calls)).toHaveLength(0);
  });

  it("writes the full 2027 substrate in one bulk write per collection", async () => {
    const { db, calls } = recordingDb();
    const log = vi.fn();
    await writeCA2027(db, true, log);

    expect(calls.states!.bulkWrite.mock.calls[0]![0]).toHaveLength(13);
    const partyOps = calls.politicalParties!.bulkWrite.mock.calls[0]![0] as Array<{
      insertOne: { document: { sequentialId: number; countryId: string } };
    }>;
    expect(partyOps).toHaveLength(caParties.length);
    expect(partyOps.map((op) => op.insertOne.document.sequentialId)).toEqual([1, 2, 3, 4, 5]);
    expect(calls.stateDemographics!.bulkWrite.mock.calls[0]![0]).toHaveLength(13);
    expect(calls.stateBaselines!.bulkWrite.mock.calls[0]![0]).toHaveLength(13);
    expect(calls.statePartyOrg!.bulkWrite.mock.calls[0]![0]).toHaveLength(13 * 5);

    const formation = calls.governmentFormations!.updateOne.mock.calls[0]![1].$setOnInsert;
    expect(calls.governmentFormations!.updateOne.mock.calls[0]![1]).not.toHaveProperty("$set");
    expect(formation).toMatchObject({ countryId: "CA", totalSeats: 343, majorityThreshold: 172 });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("343-seat Commons"));
  });

  it("scopes every reset delete to Canada", async () => {
    const { db, calls } = recordingDb();
    await writeCA2027(db, true, () => {});
    for (const name of ["states", "statePartyOrg", "stateDemographics", "macroMetrics"]) {
      expect(calls[name]!.deleteMany).toHaveBeenCalledWith({ countryId: "CA" });
    }
    const baselineFilter = calls.stateBaselines!.deleteMany.mock.calls[0]![0];
    expect(baselineFilter._id.$in.every((id: string) => id.startsWith("CA_"))).toBe(true);
  });
});
