import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { recordPrimarySnapshots } from "./primarySnapshots";
vi.mock("@/lib/demographics/granularElectorate", () => ({
  buildGranularElectorateSubstrate: () => ({ totalPool: 1000000 }),
}));
const election = new ObjectId(),
  character = new ObjectId(),
  candidate = new ObjectId();
const now = new Date("2026-01-01T00:00:00Z");
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 100,
      currentYear: 2027,
      startingYear: 2027,
      preset: "2027-default",
      worldEpochId: "synthetic",
    },
  ]);
  f.memory.seed("elections", [
    {
      _id: election,
      electionType: "senate",
      status: "active",
      countryId: "US",
      state: "CA",
      seatId: "US-senate-CA-1",
      startTurn: 80,
      primaryEndTurn: 110,
      endTurn: 140,
    },
  ]);
  f.memory.seed("electionCandidates", [
    {
      _id: candidate,
      electionId: election,
      characterId: character,
      characterName: "Synthetic candidate",
      party: "1",
      status: "active",
      isNPP: false,
    },
  ]);
  f.memory.seed("characters", [
    {
      _id: character,
      name: "Synthetic candidate",
      homeState: "CA",
      countryId: "US",
      policies: { economic: 0, social: 0 },
      favorability: 50,
      politicalInfluence: 50,
    },
  ]);
  f.memory.seed("politicalParties", [
    {
      _id: new ObjectId(),
      countryId: "US",
      sequentialId: 1,
      economicPosition: 0,
      socialPosition: 0,
    },
  ]);
  f.memory.seed("states", [{ _id: "CA", countryId: "US", population: 2000000 }]);
  f.memory.seed("stateDemographics", [
    { _id: "CA", countryId: "US", groups: {}, categoryWeights: {} },
  ]);
  f.memory.seed("statePartyOrg", [
    {
      _id: "CA_1",
      countryId: "US",
      stateId: "CA",
      partyId: "1",
      registration: 40,
      organization: 40,
    },
  ]);
  return f;
}
async function total(db: ReturnType<typeof fixture>["db"]) {
  const tally = await db.collection("electionVoteTallies").findOne({ electionId: election });
  return Object.values(tally?.primaryVotes ?? {}).reduce<number>(
    (n, value) => n + Number(value),
    0
  );
}
describe("primary snapshot and ballot publication", () => {
  it.each(["elections", "primarySnapshots", "electionVoteTallies"])(
    "recovers a landed %s failure",
    async (collection) => {
      const { db, memory } = fixture();
      const fault = withInjectedCrash(memory, { collection, onCall: 1, afterWrite: true });
      await expect(recordPrimarySnapshots(now, 100, undefined, { db: fault.db })).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(await db.collection("primarySnapshots").countDocuments({})).toBe(0);
      expect(await db.collection("electionVoteTallies").countDocuments({})).toBe(0);
      expect(await recordPrimarySnapshots(now, 100, undefined, { db })).toBe(1);
      expect(await total(db)).toBeGreaterThan(0);
      const first = await total(db);
      expect(await recordPrimarySnapshots(now, 100, undefined, { db })).toBe(0);
      expect(await total(db)).toBe(first);
    }
  );
  it("overlapping full passes and early/rest passes bank one turn of ballots", async () => {
    const full = fixture();
    await recordPrimarySnapshots(now, 100, undefined, { db: full.db });
    const expected = await total(full.db);
    const race = fixture();
    await Promise.all([
      recordPrimarySnapshots(now, 100, undefined, { db: race.db }),
      recordPrimarySnapshots(now, 100, undefined, { db: race.db }),
    ]);
    expect(await total(race.db)).toBe(expected);
    const split = fixture();
    await recordPrimarySnapshots(now, 100, undefined, { db: split.db, slice: "early" });
    await recordPrimarySnapshots(now, 100, undefined, { db: split.db });
    expect(await total(split.db)).toBeCloseTo(expected, 6);
    expect(await split.db.collection("primarySnapshots").countDocuments({})).toBe(2);
  });
});
