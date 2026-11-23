import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
vi.mock("@/lib/db/sessionDb", async () =>
  (await import("@/lib/test-utils/atomicDomainMock")).atomicDomainMock()
);
vi.mock("@/lib/wireEvent", () => ({ logWireEvent: vi.fn() }));
vi.mock("@/lib/budget/treasurySpend", () => ({
  refundTreasurySpend: async (
    db: ReturnType<typeof createInMemoryDb>,
    countryId: string,
    amount: number
  ) => {
    await db
      .collection("federalBudget")
      .updateOne({ _id: countryId }, { $inc: { treasuryBalance: amount } });
  },
}));
import { processCrisisAidResolutions, reverseCrisisAidPenalties } from "@/lib/crises/aidFinalize";

describe("Aid outcome transaction recovery", () => {
  it.each(["crisisAidCommitments", "federalBudget", "governmentApprovals"])(
    "rolls back an interrupted %s write and retries without losing cash",
    async (collection) => {
      const db = createInMemoryDb();
      const commitmentId = new ObjectId(),
        billId = new ObjectId(),
        crisisId = new ObjectId();
      db.seed("crisisAidCommitments", [
        {
          _id: commitmentId,
          crisisId,
          billId,
          senderCountryId: "US",
          status: "pending",
          treasuryDebited: 10,
          recoveryEffects: [],
          senderEffects: [{ targetType: "approval", value: 2 }],
        },
      ]);
      db.seed("bills", [{ _id: billId, status: "failed" }]);
      db.seed("federalBudget", [{ _id: "US", treasuryBalance: 90 }]);
      db.seed("governmentApprovals", [
        { _id: "US", approvalRating: 52, approvalRawRating: 52, approvalAdjustment: 2 },
      ]);
      const target = db.collection(collection);
      const write = target.updateOne.bind(target);
      let interrupt = true;
      target.updateOne = async (...args: Parameters<typeof write>) => {
        const result = await write(...args);
        if (interrupt) {
          interrupt = false;
          throw new Error("interrupted write");
        }
        return result;
      };
      await expect(processCrisisAidResolutions(db as never, 10)).rejects.toThrow(
        "interrupted write"
      );
      expect(db.collection("crisisAidCommitments").docs[0].status).toBe("pending");
      expect(db.collection("federalBudget").docs[0].treasuryBalance).toBe(90);
      expect(db.collection("governmentApprovals").docs[0].approvalRating).toBe(52);
      await processCrisisAidResolutions(db as never, 10);
      await processCrisisAidResolutions(db as never, 10);
      expect(db.collection("federalBudget").docs[0].treasuryBalance).toBe(100);
      expect(db.collection("governmentApprovals").docs[0].approvalRating).toBe(45);
      await Promise.all([
        reverseCrisisAidPenalties(db as never, 16),
        reverseCrisisAidPenalties(db as never, 16),
      ]);
      expect(db.collection("governmentApprovals").docs[0].approvalRating).toBe(50);
      expect(db.collection("federalBudget").docs[0].treasuryBalance).toBe(100);
    }
  );
});

it("batches fifty expiries into four database commands without changing their total", async () => {
  const db = createInMemoryDb();
  db.seed(
    "crisisAidCommitments",
    Array.from({ length: 50 }, () => ({
      _id: new ObjectId(),
      senderCountryId: "US",
      status: "failed",
      penaltyReversed: false,
      approvalPenaltyExpiresTurn: 10,
    }))
  );
  const country = db.seed("governmentApprovals", [
    { _id: "US", approvalRating: 0, approvalRawRating: -200, approvalAdjustment: -250 },
  ]);
  const commitments = db.collection("crisisAidCommitments");
  const claims = vi.spyOn(commitments, "bulkWrite"),
    approvals = vi.spyOn(country, "bulkWrite");
  expect(await reverseCrisisAidPenalties(db as never, 10)).toBe(50);
  expect(claims).toHaveBeenCalledTimes(1);
  expect(approvals).toHaveBeenCalledTimes(2);
  expect(country.docs[0].approvalRating).toBe(50);
  expect(await reverseCrisisAidPenalties(db as never, 10)).toBe(0);
  expect(country.docs[0].approvalRating).toBe(50);
});
