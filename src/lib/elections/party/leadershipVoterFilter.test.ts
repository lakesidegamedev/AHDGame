import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import {
  committeeBallotClause,
  committeeElectorate,
  leadershipVoterFilter,
  leadershipEligibilityFilters,
} from "./leadershipVoterFilter";
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

describe("committeeElectorate", () => {
  it("is the committee plus seated officers under the committee method", () => {
    const member = new ObjectId();
    const chair = new ObjectId();
    const ids = committeeElectorate({
      leadershipElectionMethod: "committee",
      committeeIds: [member, chair],
      chairId: chair,
      viceChairId: null,
      treasurerId: null,
    });
    expect(ids?.map(String).sort()).toEqual([member, chair].map(String).sort());
  });

  it("is null for the party and influence methods", () => {
    expect(committeeElectorate({ leadershipElectionMethod: "party" })).toBeNull();
    expect(committeeElectorate({ leadershipElectionMethod: "influence" })).toBeNull();
    expect(committeeElectorate(undefined)).toBeNull();
  });
});

describe("committeeBallotClause", () => {
  it("restricts committee-method elections and leaves the others open", () => {
    const committeeElection = { _id: new ObjectId(), partyId: "1", countryId: "US" };
    const openElection = { _id: new ObjectId(), partyId: "2", countryId: "US" };
    const member = new ObjectId();
    const clause = committeeBallotClause([committeeElection, openElection], (partyId) =>
      partyId === "1"
        ? { leadershipElectionMethod: "committee", committeeIds: [member] }
        : { leadershipElectionMethod: "party" }
    );
    expect(clause).toEqual({
      $or: [
        { electionId: { $in: [openElection._id] } },
        { electionId: committeeElection._id, voterId: { $in: [member] } },
      ],
    });
  });

  it("is null when no election uses the committee method", () => {
    const election = { _id: new ObjectId(), partyId: "2", countryId: "US" };
    expect(
      committeeBallotClause([election], () => ({ leadershipElectionMethod: "party" }))
    ).toBeNull();
  });
});
