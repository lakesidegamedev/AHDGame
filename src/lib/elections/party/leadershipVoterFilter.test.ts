import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { leadershipVoterFilter } from "./leadershipVoterFilter";

describe("leadership electorate at resolution", () => {
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
