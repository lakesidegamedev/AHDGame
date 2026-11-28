import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { publishNppBillVotes, type NppBillVotePublication } from "./publishBillVotes";
const voter = new ObjectId(),
  key = `npp_${voter.toHexString()}`;
function fixture(count = 1) {
  const f = createTransactionalMemoryDb();
  const plans: NppBillVotePublication[] = Array.from({ length: count }, () => ({
    billId: new ObjectId(),
    status: "active",
    observedVotes: { [`votes.${key}`]: { $exists: false } },
    setFields: { [`votes.${key}`]: "for" },
    incFields: { votesFor: 1 },
    votesCast: 1,
    predictions: [
      {
        nppId: voter,
        forces: { ideology: 10, whip: 0, district: 0, donors: 10 },
        donorsLabel: "Synthetic business interest",
        verdict: "for",
        resolvedVote: "for",
      },
    ],
    interestNppIds: [voter],
  }));
  f.memory.seed(
    "bills",
    plans.map((p) => ({ _id: p.billId, status: "active", votes: {}, votesFor: 0 }))
  );
  f.memory.seed("npps", [{ _id: voter, favorability: 50 }]);
  return { ...f, plans };
}
describe("bounded NPP ballot publication", () => {
  it.each(["bills", "nppVotePredictions", "npps"])(
    "a landed %s failure rolls back ballots and consequences",
    async (collection) => {
      const { db, memory, plans } = fixture();
      const fault = withInjectedCrash(memory, {
        collection,
        op: "bulkWrite",
        onCall: 1,
        afterWrite: true,
      });
      await expect(publishNppBillVotes(fault.db, plans, 100, new Date())).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect((await db.collection("bills").findOne({}))?.votesFor).toBe(0);
      expect(await db.collection("nppVotePredictions").countDocuments({})).toBe(0);
      expect((await db.collection("npps").findOne({}))?.favorability).toBe(50);
      expect(await publishNppBillVotes(db, plans, 100, new Date())).toBe(1);
      expect(await publishNppBillVotes(db, plans, 100, new Date())).toBe(0);
      expect((await db.collection("bills").findOne({}))?.votesFor).toBe(1);
      expect((await db.collection("npps").findOne({}))?.favorability).toBe(49);
      expect(await db.collection("nppVotePredictions").countDocuments({})).toBe(1);
    }
  );
  it("overlapping and multi-batch retries charge one penalty per voter per turn", async () => {
    const { db, plans } = fixture(35);
    const replies = await Promise.all([
      publishNppBillVotes(db, plans, 100, new Date()),
      publishNppBillVotes(db, plans, 100, new Date()),
    ]);
    expect(replies.reduce((n, count) => n + count, 0)).toBe(35);
    expect((await db.collection("npps").findOne({}))?.favorability).toBe(49);
    expect(await db.collection("nppVotePredictions").countDocuments({})).toBe(35);
  });
  it("a changed ballot or closed bill is excluded with its prediction and penalty", async () => {
    const { db, plans } = fixture(2);
    await db
      .collection("bills")
      .updateOne(
        { _id: plans[0].billId },
        { $set: { [`votes.${key}`]: "against", votesAgainst: 1 } }
      );
    await db
      .collection("bills")
      .updateOne({ _id: plans[1].billId }, { $set: { status: "passed" } });
    expect(await publishNppBillVotes(db, plans, 100, new Date())).toBe(0);
    expect(await db.collection("nppVotePredictions").countDocuments({})).toBe(0);
    expect((await db.collection("npps").findOne({}))?.favorability).toBe(50);
  });
});
