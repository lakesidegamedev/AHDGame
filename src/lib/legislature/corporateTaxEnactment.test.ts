import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import type { FederalBudget } from "@/lib/db/types";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { applyCorporateTaxBillChange, type CorporateTaxVoteInput } from "./corporateTaxEnactment";
const session = {};
vi.mock("@/lib/db/runRequiredTransaction", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/runRequiredTransaction")>()),
  runRequiredTransaction: vi.fn(async (body) => body(session)),
}));
const charId = new ObjectId().toString(),
  nppId = new ObjectId().toString();
const input: CorporateTaxVoteInput = {
  billId: new ObjectId().toString(),
  legislationTypeId: "test-corporate-tax",
  countryId: "UK",
  scope: "federal",
  stateId: "uk_national",
  taxType: "domesticCorporateTax",
  proposedRate: 20,
  turn: 10,
  ballots: { votes: { [charId]: "for", [`npp_${nppId}`]: "against" } },
};
function fixture() {
  const db = Object.assign(createMockDb(), { client: {} });
  db.collection("federalBudget").findOne.mockResolvedValue({
    taxRates: { domesticCorporateTax: 30, foreignCorporateTax: 30 },
  });
  db.collection("stateBudgets").findOne.mockResolvedValue({
    taxRates: { domesticCorporateTax: 30, foreignCorporateTax: 30 },
  });
  db.collection("gameState").findOne.mockResolvedValue({ resetWorldId: "synthetic-world" });
  return db;
}
describe("corporate tax reactions", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["US", "UK", "JP", "IE", "SCO", "WAL"] as const)(
    "commits %s income/wealth reactions and tax update in the same session",
    async (countryId) => {
      const db = fixture();
      const writeRate = vi.fn(async (transactionDb: Db) => {
        await transactionDb
          .collection<FederalBudget>("federalBudget")
          .updateOne({ _id: "budget" }, { $set: { "taxRates.domesticCorporateTax": 20 } });
      });
      await applyCorporateTaxBillChange(db as unknown as Db, { ...input, countryId }, writeRate);
      expect(writeRate).toHaveBeenCalledTimes(1);
      expect(db.collectionMocks.federalBudget!.updateOne.mock.calls[0]![2]).toEqual({ session });
      const dimension = countryId === "US" ? "wealth" : "income";
      for (const [collection, sign] of [
        ["characters", 1],
        ["npps", -1],
      ] as const) {
        const call = db.collectionMocks[collection]!.bulkWrite.mock.calls[0]!;
        expect(call[1]).toEqual({ session });
        const fields = call[0][0].updateOne.update[0].$set;
        expect(fields[`bucketApprovals.${dimension}:low`].$min[1].$max[1].$add[1]).toBe(-sign);
        expect(fields[`bucketApprovals.${dimension}:middle`].$min[1].$max[1].$add[1]).toBe(
          -0.8 * sign
        );
        expect(fields[`bucketApprovals.${dimension}:high`].$min[1].$max[1].$add[1]).toBe(
          1.2 * sign
        );
      }
      expect(db.collectionMocks.resetLawEnactmentReceipts!.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({ programIds: [], worldId: "synthetic-world" }),
        { session }
      );
      db.collectionMocks.resetLawEnactmentReceipts!.findOne.mockResolvedValue({ _id: "existing" });
      await applyCorporateTaxBillChange(db as unknown as Db, { ...input, countryId }, writeRate);
      expect(writeRate).toHaveBeenCalledTimes(1);
      expect(db.collectionMocks.characters!.bulkWrite).toHaveBeenCalledTimes(1);
    }
  );
  it("uses an already legislated phase-in target, not a stale proposal snapshot", async () => {
    const db = fixture();
    db.collection("federalBudget").findOne.mockResolvedValue({
      taxRates: { domesticCorporateTax: 28 },
      taxRatePhaseIn: { domesticCorporateTax: 20 },
    });
    const writeRate = vi.fn();
    await applyCorporateTaxBillChange(db as unknown as Db, input, writeRate);
    expect(writeRate).not.toHaveBeenCalled();
    expect(db.collectionMocks.characters).toBeUndefined();
  });
  it("treats regional foreign corporate tax the same way", async () => {
    const db = fixture(),
      writeRate = vi.fn(async () => {});
    await applyCorporateTaxBillChange(
      db as unknown as Db,
      { ...input, countryId: "US", scope: "state", stateId: "PA", taxType: "foreignCorporateTax" },
      writeRate
    );
    expect(db.collectionMocks.stateBudgets!.findOne).toHaveBeenCalledWith(
      { _id: "PA", countryId: "US" },
      { projection: { taxRates: 1 }, session }
    );
    expect(db.collectionMocks.characters!.bulkWrite).toHaveBeenCalledTimes(1);
  });
  it("does not award reactions or write a receipt when applying the tax fails", async () => {
    const db = fixture();
    await expect(
      applyCorporateTaxBillChange(db as unknown as Db, input, async () => {
        throw new Error("tax write failed");
      })
    ).rejects.toThrow("tax write failed");
    expect(db.collectionMocks.characters).toBeUndefined();
    expect(db.collectionMocks.resetLawEnactmentReceipts!.insertOne).not.toHaveBeenCalled();
  });
  it("skips missing budgets without awarding an unimplemented tax change", async () => {
    const db = fixture(),
      writeRate = vi.fn();
    db.collection("federalBudget").findOne.mockResolvedValue(null);
    await expect(
      applyCorporateTaxBillChange(db as unknown as Db, input, writeRate)
    ).resolves.toBeUndefined();
    expect(db.collectionMocks.characters).toBeUndefined();
    expect(writeRate).not.toHaveBeenCalled();
  });
});
