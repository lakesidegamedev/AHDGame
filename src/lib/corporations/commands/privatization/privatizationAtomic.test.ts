import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import type { CorporationPrivatizationVote } from "@/lib/db/types";
import { resolvePrivatizationVote } from "./resolvePrivatizationVote";
import { cancelPrivatizationVote } from "./cancelPrivatizationVote";
import { openPrivatizationVote } from "./openPrivatizationVote";
import { notifyVoteEventRaw } from "@/lib/corporations/votes/voteNotifications";
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/wireEvent", () => ({
  logWireEvent: vi.fn(),
  wireHeadlineCorpPrivatized: () => "private",
  wireHeadlineCorpPrivatizationVoteFailed: () => "failed",
}));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/corporations/votes/voteNotifications", () => ({
  notifyVoteEventRaw: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./privatizationQuote", () => ({
  quotePrivatizationBuyout: vi.fn().mockResolvedValue({
    lockedBuyoutPrice: 1,
    totalReservedCash: 100,
    bankNavFloorApplied: false,
  }),
}));
function fixture() {
  const { db, memory } = createTransactionalMemoryDb();
  const ceoId = new ObjectId(),
    holderId = new ObjectId(),
    corpId = new ObjectId(),
    recipientId = new ObjectId();
  const corporation = {
    _id: corpId,
    name: "Synthetic",
    ceoId,
    totalShares: 1000,
    isPrivate: false,
    liquidCapital: 200,
    liquidCurrencyCode: "USD",
    publicFloat: 0,
    shareholders: [
      { characterId: ceoId, shares: 900 },
      { characterId: holderId, shares: 50 },
      { corporationId: recipientId, shares: 50 },
    ],
  };
  const vote = {
    _id: new ObjectId(),
    corporationId: corpId,
    openedByCharacterId: ceoId,
    openedAtTurn: 1,
    deadlineAtTurn: 2,
    lockedBuyoutPrice: 1,
    lockedBuyoutCurrency: "USD",
    totalReservedCash: 100,
    reservedCashCurrency: "USD",
    status: "open",
    votes: [{ characterId: holderId, voteShares: 50, vote: "yes", castAt: new Date() }],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as CorporationPrivatizationVote;
  memory.seed("corporations", [
    corporation,
    { _id: recipientId, countryId: "CA", liquidCurrencyCode: "CAD", liquidCapital: 0 },
  ]);
  memory.seed("characters", [
    { _id: ceoId, cashOnHand: 500 },
    { _id: holderId, cashOnHand: 0 },
  ]);
  memory.seed("corporationPrivatizationVotes", [{ ...vote }]);
  const input = {
    db,
    vote,
    currentTurn: 3,
    forexEnabled: false,
    fxByCurrency: new Map([
      ["USD" as const, 1],
      ["CAD" as const, 2],
    ]),
  };
  return { db, memory, corporation, vote, input, ceoId, holderId, recipientId, corpId };
}
describe("atomic privatization cash and ownership", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rolls back terminal status and all payouts after a late ownership-write failure, then retries once", async () => {
    const f = fixture();
    const collection = f.memory.collection("corporations");
    const update = collection.updateOne.bind(collection);
    vi.spyOn(collection, "updateOne")
      .mockImplementationOnce(async (...args) => update(...args))
      .mockRejectedValueOnce(new Error("interrupted consolidation"));
    await expect(resolvePrivatizationVote(f.input)).rejects.toThrow("interrupted consolidation");
    expect(
      (await f.memory.collection("corporationPrivatizationVotes").findOne({ _id: f.vote._id }))
        ?.status
    ).toBe("open");
    expect((await f.memory.collection("characters").findOne({ _id: f.holderId }))?.cashOnHand).toBe(
      0
    );
    expect((await collection.findOne({ _id: f.recipientId }))?.liquidCapital).toBe(0);
    expect(notifyVoteEventRaw).not.toHaveBeenCalled();
    await Promise.all([resolvePrivatizationVote(f.input), resolvePrivatizationVote(f.input)]);
    expect((await f.memory.collection("characters").findOne({ _id: f.holderId }))?.cashOnHand).toBe(
      50
    );
    expect((await collection.findOne({ _id: f.recipientId }))?.liquidCapital).toBe(100);
    expect((await collection.findOne({ _id: f.corpId }))?.isPrivate).toBe(true);
    expect(notifyVoteEventRaw).toHaveBeenCalledTimes(1);
  });
  it("refund and terminal cancellation roll back together and overlapping retries refund once", async () => {
    const f = fixture();
    const chars = f.memory.collection("characters");
    vi.spyOn(chars, "updateOne").mockRejectedValueOnce(new Error("interrupted refund"));
    await expect(cancelPrivatizationVote(f.input)).rejects.toThrow("interrupted refund");
    expect(
      (await f.memory.collection("corporationPrivatizationVotes").findOne({ _id: f.vote._id }))
        ?.status
    ).toBe("open");
    await Promise.all([cancelPrivatizationVote(f.input), cancelPrivatizationVote(f.input)]);
    expect((await chars.findOne({ _id: f.ceoId }))?.cashOnHand).toBe(600);
  });
  it("rolls back a failed reserve insertion and serializes overlapping open requests", async () => {
    const f = fixture();
    await f.memory.collection("corporationPrivatizationVotes").deleteMany({});
    const votes = f.memory.collection("corporationPrivatizationVotes");
    vi.spyOn(votes, "insertOne").mockRejectedValueOnce(new Error("interrupted insert"));
    const input = {
      db: f.db,
      corporation: f.corporation as never,
      character: { _id: f.ceoId } as never,
      currentTurn: 3,
      forexEnabled: false,
    };
    await expect(openPrivatizationVote(input)).rejects.toThrow("interrupted insert");
    expect((await f.memory.collection("characters").findOne({ _id: f.ceoId }))?.cashOnHand).toBe(
      500
    );
    await Promise.all([openPrivatizationVote(input), openPrivatizationVote(input)]);
    expect(votes.docs).toHaveLength(1);
    expect((await f.memory.collection("characters").findOne({ _id: f.ceoId }))?.cashOnHand).toBe(
      400
    );
  });
});
