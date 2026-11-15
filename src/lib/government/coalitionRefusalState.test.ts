import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { syncCoalitionRefusals } from "./coalitionRefusalState";

type Doc = Record<string, unknown>;

/** Just the reads and writes `syncCoalitionRefusals` issues. */
function fakeDb(state: { gov: Doc | null; elections: Doc[]; parties: Doc[] }) {
  const writes: Doc[] = [];
  const unfinished = (cycle: unknown) =>
    state.elections.filter(
      (e) => e.cycle === cycle && (e.status === "upcoming" || e.status === "active")
    ).length;
  const db = {
    collection: (name: string) => {
      if (name === "governmentFormations")
        return {
          findOne: async () => state.gov,
          updateOne: async (_q: Doc, update: { $set: Doc }) => {
            writes.push(update.$set);
            state.gov = { ...state.gov, ...update.$set };
          },
        };
      if (name === "elections")
        return {
          findOne: async () =>
            state.elections
              .filter((e) => e.status === "completed")
              .sort((a, b) => Number(b.cycle) - Number(a.cycle))[0] ?? null,
          countDocuments: async (q: Doc) => unfinished(q.cycle),
        };
      if (name === "politicalParties")
        return { find: () => ({ toArray: async () => state.parties }) };
      throw new Error(`unexpected collection ${name}`);
    },
  } as unknown as Db;
  return { db, writes, state };
}

const parties = [
  { sequentialId: 2, abbreviation: "CDU" },
  { sequentialId: 3, abbreviation: "CSU" },
  { sequentialId: 7, abbreviation: "AFD" },
];

describe("syncCoalitionRefusals", () => {
  it("does nothing for a preset or country with no authored refusals", async () => {
    const { db, writes } = fakeDb({ gov: {}, elections: [], parties });
    expect(await syncCoalitionRefusals(db, "DE", "2019-default")).toEqual([]);
    expect(await syncCoalitionRefusals(db, "UK", "2027-default")).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("seeds the 2027 German refusals once, then advances them per finished election", async () => {
    const fake = fakeDb({
      gov: { seatsByParty: { "2": 164, "3": 44, "7": 152 } },
      elections: [],
      parties,
    });
    const seeded = await syncCoalitionRefusals(fake.db, "DE", "2027-default");
    expect(seeded).toContainEqual({ refuser: "CDU", refused: "AFD", consecutiveLosses: 0 });
    expect(fake.state.gov?.coalitionRefusalElection).toEqual({
      key: "seed",
      seats: { CDU: 164, CSU: 44, AFD: 152 },
    });

    // No finished election: nothing to write.
    await syncCoalitionRefusals(fake.db, "DE", "2027-default");
    expect(fake.writes).toHaveLength(1);

    // A cycle with a Land still counting does not count yet.
    fake.state.gov = { ...fake.state.gov, seatsByParty: { "2": 150, "3": 40, "7": 190 } };
    fake.state.elections = [
      { cycle: 1, status: "completed" },
      { cycle: 1, status: "active" },
    ];
    await syncCoalitionRefusals(fake.db, "DE", "2027-default");
    expect(fake.writes).toHaveLength(1);

    // Once the whole cycle is in, the Union lost while the AfD leads.
    fake.state.elections = [{ cycle: 1, status: "completed" }];
    const after = await syncCoalitionRefusals(fake.db, "DE", "2027-default");
    expect(after).toContainEqual({ refuser: "CDU", refused: "AFD", consecutiveLosses: 1 });
    expect(after).toContainEqual({ refuser: "CSU", refused: "AFD", consecutiveLosses: 1 });
    expect(fake.state.gov?.coalitionRefusalElection).toMatchObject({ key: "bundestag:1" });
  });
});
