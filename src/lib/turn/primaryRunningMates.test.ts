import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";

const createNotifications = vi.fn();
vi.mock("@/lib/notifications", () => ({
  createNotifications: (...args: unknown[]) => createNotifications(...args),
}));

import { autoAssignTentativeRunningMates } from "./primaryRunningMates";

describe("autoAssignTentativeRunningMates (ticket 1889)", () => {
  it("invites the fallback pick instead of seating them on the ticket", async () => {
    const nomineeCharId = new ObjectId();
    const pick = { _id: new ObjectId(), userId: new ObjectId(), name: "Fallback Pick" };
    const nominee = {
      _id: new ObjectId(),
      electionId: new ObjectId(),
      characterId: nomineeCharId,
      characterName: "Nominee",
      party: "2",
      isNPP: false,
    };
    const bulkWrite = vi.fn().mockResolvedValue({ matchedCount: 1 });
    const db = {
      collection: (name: string) => {
        if (name === "electedOfficials") return { findOne: vi.fn().mockResolvedValue(null) };
        if (name === "electionCandidates") return { bulkWrite };
        if (name === "characters")
          return {
            find: (q: Record<string, unknown>) => {
              const docs = q.party ? [pick] : [{ _id: nomineeCharId, userId: new ObjectId() }];
              const cursor = {
                sort: () => cursor,
                limit: () => cursor,
                toArray: async () => docs,
              };
              return cursor;
            },
          };
        throw new Error(`unexpected collection ${name}`);
      },
    };

    await autoAssignTentativeRunningMates(db as never, [nominee as never], "US");

    const [ops] = bulkWrite.mock.calls[0];
    const update = ops[0].updateOne.update.$set;
    expect(update.pendingRunningMateId).toEqual(pick._id);
    expect(update).not.toHaveProperty("runningMateId");
    const sent = createNotifications.mock.calls[0][0];
    expect(sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: pick.userId, type: "running_mate_invite" }),
      ])
    );
  });
});
