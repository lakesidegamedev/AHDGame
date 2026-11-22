import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { leadershipVoterFilter, leadershipEligibilityFilters } from "./leadershipVoterFilter";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";

describe("leadership electorate at resolution", () => {
  it("uses the same current membership for candidates and voters, excluding retirement and foreign members", async () => {
    const memory = createInMemoryDb();
    const eligible = new ObjectId(),
      retired = new ObjectId(),
      foreign = new ObjectId(),
      departed = new ObjectId();
    const electionId = new ObjectId();
    memory.seed("characters", [
      { _id: eligible, party: "1", countryId: "US" },
      { _id: retired, party: "1", countryId: "US", retiredAt: new Date(0) },
      { _id: foreign, party: "1", countryId: "CA" },
      { _id: departed, party: "2", countryId: "US" },
    ]);
    const { voterFilter, candidateFilter } = await leadershipEligibilityFilters(
      memory as unknown as Db,
      [{ _id: electionId, partyId: "1", countryId: "US" }]
    );
    memory.seed(
      "candidates",
      [eligible, retired, foreign, departed].map((characterId) => ({ electionId, characterId }))
    );
    memory.seed(
      "votes",
      [eligible, retired, foreign, departed].map((voterId) => ({ electionId, voterId }))
    );
    expect(await memory.collection("candidates").find(candidateFilter).toArray()).toEqual([
      { electionId, characterId: eligible },
    ]);
    expect(await memory.collection("votes").find(voterFilter).toArray()).toEqual([
      { electionId, voterId: eligible },
    ]);
  });

  it("keeps each country's members separate and excludes members who switched parties", async () => {
    const db = createMockDb();
    const usVoter = new ObjectId(),
      caVoter = new ObjectId(),
      departed = new ObjectId();
    const usElection = new ObjectId(),
      caElection = new ObjectId();
    db.collection("characters").find.mockReturnValue({
      toArray: async () => [
        { _id: usVoter, party: "1", countryId: "US" },
        { _id: caVoter, party: "1", countryId: "CA" },
        { _id: departed, party: "2", countryId: "US" },
      ],
    });
    const filter = await leadershipVoterFilter(db as unknown as Db, [
      { _id: usElection, partyId: "1", countryId: "US" },
      { _id: caElection, partyId: "1", countryId: "CA" },
    ]);
    expect(filter).toEqual({
      $or: [
        { electionId: { $in: [usElection] }, voterId: { $in: [usVoter] } },
        { electionId: { $in: [caElection] }, voterId: { $in: [caVoter] } },
      ],
    });
    expect(db.collection("characters").find).toHaveBeenCalledOnce();
    expect(db.collection("characters").find).toHaveBeenCalledWith(
      expect.objectContaining({ retiredAt: { $exists: false } }),
      { projection: { _id: 1, party: 1, countryId: 1 } }
    );
  });
});
