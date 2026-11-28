import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Election } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
vi.mock("@/lib/elections/raceWireEmit", () => ({ emitPrimaryTierWire: vi.fn(async () => {}) }));
import { emitPrimaryTierWire } from "@/lib/elections/raceWireEmit";
import { runPrimaryStaggerWaveIfDue } from "./primaryStaggerPhase";
function fixture() {
  const f = createTransactionalMemoryDb(),
    electionId = new ObjectId();
  const election = {
    _id: electionId,
    electionType: "president",
    countryId: "US",
    status: "active",
    primaryEndTurn: 15,
  } as Election;
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 10, worldEpochId: "synthetic-stagger" },
  ]);
  f.memory.seed("elections", [{ ...election }]);
  f.memory.seed("politicalParties", [
    {
      _id: new ObjectId(),
      countryId: "US",
      sequentialId: 1,
      name: "Party",
      economicPosition: -2,
      socialPosition: -2,
    },
  ]);
  f.memory.seed("states", [{ _id: "IA", countryId: "US", name: "Iowa", population: 3000000 }]);
  f.memory.seed("stateDemographics", [
    {
      _id: "IA",
      countryId: "US",
      categoryWeights: { voterGroups: 100 },
      groups: { all: { population: 3000000, economicLean: -1, socialLean: -1, turnout: 60 } },
      lastUpdated: new Date(),
    },
  ]);
  const chars = [new ObjectId(), new ObjectId()];
  f.memory.seed(
    "characters",
    chars.map((_id, i) => ({
      _id,
      name: "Candidate " + i,
      homeState: "IA",
      policies: { economic: -2 + i * 3, social: -1 },
      nationalInfluence: 50,
      partyInfluence: 10,
      favorability: 50,
      politicalInfluence: 50,
      personalWealth: 1000,
    }))
  );
  f.memory.seed(
    "electionCandidates",
    chars.map((characterId, i) => ({
      _id: new ObjectId(),
      electionId,
      characterId,
      characterName: "Candidate " + i,
      party: "1",
      status: "active",
      isNPP: false,
    }))
  );
  f.memory.seed("electionVoteTallies", [
    {
      _id: new ObjectId(),
      electionId,
      primaryWaveHistory: [],
      primaryStaggerWavesRun: 0,
      primaryStateVotes: {},
      primaryDelegates: {},
    },
  ]);
  return { ...f, election };
}
describe("primary wave and favorability atomicity", () => {
  it.each([
    { collection: "characters", op: "bulkWrite" as const },
    { collection: "electionVoteTallies", op: "updateOne" as const },
  ])("recovers after landed $collection.$op", async (point) => {
    const { db, memory, election } = fixture();
    vi.mocked(emitPrimaryTierWire).mockClear();
    const before = await db.collection("characters").find({}).toArray();
    const fault = withInjectedCrash(memory, { ...point, onCall: 1, afterWrite: true });
    await expect(runPrimaryStaggerWaveIfDue(fault.db, election, new Date(), 10)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(await db.collection("characters").find({}).toArray()).toEqual(before);
    expect((await db.collection("electionVoteTallies").findOne({}))!.primaryStaggerWavesRun).toBe(
      0
    );
    expect(emitPrimaryTierWire).not.toHaveBeenCalled();
    const first = await runPrimaryStaggerWaveIfDue(db, election, new Date(), 10);
    expect(first!.wavesRun).toBe(1);
    const after = await db.collection("characters").find({}).toArray();
    expect(after.some((c, i) => c.favorability > before[i].favorability)).toBe(true);
    expect(await runPrimaryStaggerWaveIfDue(db, election, new Date(), 10)).toBeNull();
    expect(await db.collection("characters").find({}).toArray()).toEqual(after);
    expect(emitPrimaryTierWire).toHaveBeenCalledTimes(1);
  });
  it("overlapping requests publish one wave and one momentum award", async () => {
    const { db, election } = fixture();
    const results = await Promise.all([
      runPrimaryStaggerWaveIfDue(db, election, new Date(), 10),
      runPrimaryStaggerWaveIfDue(db, election, new Date(), 10),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      (await db.collection("electionVoteTallies").findOne({}))!.primaryWaveHistory
    ).toHaveLength(1);
  });
});
