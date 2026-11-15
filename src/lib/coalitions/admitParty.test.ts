import { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { admitPartyToCoalition } from "./admitParty";

function fakeDb(coalitionModified: number, partyMatched: number) {
  const coalitions = { updateOne: vi.fn().mockResolvedValue({ modifiedCount: coalitionModified }) };
  const parties = { updateOne: vi.fn().mockResolvedValue({ matchedCount: partyMatched }) };
  const db = {
    collection: (name: string) => (name === "coalitions" ? coalitions : parties),
  };
  return { db: db as never, coalitions, parties };
}

const coalition = { _id: new ObjectId() };
const party = { _id: new ObjectId(), sequentialId: 7 };

describe("admitPartyToCoalition", () => {
  it("admits once and seats the party", async () => {
    const { db, coalitions, parties } = fakeDb(1, 1);
    await expect(
      admitPartyToCoalition(db, coalition, party, "pendingInvites", new Date())
    ).resolves.toBe(true);
    expect(coalitions.updateOne.mock.calls[0][0]).toMatchObject({
      "pendingInvites.partyId": party._id,
      "members.partyId": { $ne: party._id },
    });
    expect(parties.updateOne.mock.calls[0][0]).toMatchObject({
      coalitionId: { $in: [null, coalition._id] },
    });
  });

  it("refuses a repeat accept without touching the party", async () => {
    const { db, parties } = fakeDb(0, 1);
    await expect(
      admitPartyToCoalition(db, coalition, party, "joinRequests", new Date())
    ).resolves.toBe(false);
    expect(parties.updateOne).not.toHaveBeenCalled();
  });

  it("removes the new membership when another coalition already seated the party", async () => {
    const { db, coalitions } = fakeDb(1, 0);
    await expect(
      admitPartyToCoalition(db, coalition, party, "pendingInvites", new Date())
    ).resolves.toBe(false);
    expect(coalitions.updateOne).toHaveBeenCalledTimes(2);
    expect(coalitions.updateOne.mock.calls[1][1]).toMatchObject({
      $pull: { members: { partyId: party._id } },
    });
  });
});
