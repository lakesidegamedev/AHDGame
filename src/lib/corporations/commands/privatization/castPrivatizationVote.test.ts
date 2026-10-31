import { describe, it, expect, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { castPrivatizationVote } from "./castPrivatizationVote";

describe("castPrivatizationVote", () => {
  const ceoId = new ObjectId();
  const voterId = new ObjectId();
  const otherId = new ObjectId();
  const corporation = {
    _id: new ObjectId(),
    ceoId,
    totalShares: 1_000,
    shareholders: [
      { characterId: ceoId, shares: 600 },
      { characterId: voterId, shares: 300 },
      { characterId: otherId, shares: 100 },
    ],
  };
  const earlierCast = {
    characterId: otherId,
    voteShares: 100,
    vote: "no" as const,
    castAt: new Date(0),
  };
  const vote = {
    _id: new ObjectId(),
    corporationId: corporation._id,
    status: "open" as const,
    deadlineAtTurn: 50,
    votes: [earlierCast],
  };

  function dbWith(matchedCount: number) {
    const updateOne = vi.fn().mockResolvedValue({ matchedCount });
    return { db: { collection: vi.fn(() => ({ updateOne })) } as unknown as Db, updateOne };
  }

  it("guards the write on the votes it was built from", async () => {
    const { db, updateOne } = dbWith(1);
    const result = await castPrivatizationVote({
      db,
      corporation: corporation as never,
      vote: vote as never,
      voterCharacterId: voterId,
      voteValue: "yes",
      currentTurn: 10,
    });

    expect(result.ok).toBe(true);
    const [filter, update] = updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: vote._id, status: "open", votes: vote.votes });
    expect(update.$set.votes).toHaveLength(2);
    expect(update.$set.votes[0]).toBe(earlierCast);
  });

  it("asks for a retry instead of overwriting a cast that landed in between", async () => {
    const { db } = dbWith(0);
    const result = await castPrivatizationVote({
      db,
      corporation: corporation as never,
      vote: vote as never,
      voterCharacterId: voterId,
      voteValue: "yes",
      currentTurn: 10,
    });
    expect(result).toEqual({ ok: false, error: "Vote state changed; retry", status: 409 });
  });
});
