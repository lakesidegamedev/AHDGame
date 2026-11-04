import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db, type ClientSession } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { applyV2BillVotePolicyShift } from "./v2VotePolicyShift";
import type { BillVote, PolicyShiftLedgerEntry } from "@/lib/policyShift";
const session = {} as ClientSession;
vi.mock("@/lib/db/runRequiredTransaction", () => ({
  runRequiredTransaction: vi.fn(async (body) => body(session)),
}));
const characterId = new ObjectId(),
  billId = new ObjectId();
describe("transactional v2 personal vote movement", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["bills", "stateBills"] as const)(
    "commits bounded repeat/reversal/abstention changes with %s ledger",
    async (collection) => {
      const db = createMockDb();
      let policies = { economic: 1, social: 0 };
      let ledger: PolicyShiftLedgerEntry | undefined;
      let recorded: BillVote = "for";
      db.collection(collection).findOne.mockImplementation(async () => ({
        votes: { [characterId.toString()]: recorded },
        policyShiftLedger: ledger ? { [characterId.toString()]: ledger } : {},
      }));
      db.collection("characters").findOne.mockImplementation(async () => ({ policies }));
      db.collection("characters").updateOne.mockImplementation(
        async (_filter: unknown, update: { $set: Record<string, number> }) => {
          const fields = update.$set;
          policies = { economic: fields["policies.economic"], social: fields["policies.social"] };
          return { matchedCount: 1 };
        }
      );
      db.collection(collection).updateOne.mockImplementation(
        async (_filter: unknown, update: { $set: Record<string, PolicyShiftLedgerEntry> }) => {
          ledger = update.$set[`policyShiftLedger.${characterId.toString()}`];
          return { matchedCount: 1 };
        }
      );
      for (const vote of ["for", "for", "against", "against", "abstain"] as const) {
        recorded = vote;
        await applyV2BillVotePolicyShift(
          db as unknown as Db,
          {
            collection,
            billId,
            characterId,
            provisions: [{ economic: 0, includeNeutral: true }],
            vote,
            currentPolicies: { economic: 4, social: 3 },
            ledgerEntry: undefined,
          },
          "votes"
        );
        expect(Math.abs(policies.economic - 1)).toBeLessThanOrEqual(0.25);
      }
      expect(policies).toEqual({ economic: 1, social: 0 });
      expect(db.collectionMocks.characters!.updateOne).toHaveBeenCalledTimes(3);
      for (const mock of [db.collectionMocks.characters!, db.collectionMocks[collection]!]) {
        for (const call of mock.findOne.mock.calls) expect(call[1].session).toBe(session);
        for (const call of mock.updateOne.mock.calls) expect(call[2]).toEqual({ session });
      }
    }
  );
  it("ignores a stale request superseded by a later vote", async () => {
    const db = createMockDb();
    db.collection("bills").findOne.mockResolvedValue({
      votes: { [characterId.toString()]: "against" },
    });
    await applyV2BillVotePolicyShift(
      db as unknown as Db,
      {
        collection: "bills",
        billId,
        characterId,
        provisions: [{ economic: -5 }],
        vote: "for",
        currentPolicies: { economic: 1, social: 0 },
        ledgerEntry: undefined,
      },
      "votes"
    );
    expect(db.collectionMocks.characters).toBeUndefined();
  });
});
