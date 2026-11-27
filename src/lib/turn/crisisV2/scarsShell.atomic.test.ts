import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { processCrisisScars } from "./scarsShell";
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 10, worldEpochId: "synthetic-scars" },
  ]);
  f.memory.seed("states", [{ _id: "TX", countryId: "US" }]);
  f.memory.seed("federalBudget", [{ _id: "US", countryId: "US", investorConfidence: 70 }]);
  f.memory.seed("crises", [
    {
      _id: new ObjectId(),
      scarsHealUntil: 30,
      v2: {
        scars: [
          {
            ruleId: "r",
            kind: "creditStanding",
            targetId: "US",
            magnitude: 0.02,
            createdTurn: 10,
            recoveryTurns: 20,
          },
        ],
      },
    },
  ]);
  return f;
}
describe("scar healing atomic effects", () => {
  it.each([
    { collection: "crises", op: "updateMany" as const },
    { collection: "federalBudget", op: "updateMany" as const },
    { collection: "crises", op: "bulkWrite" as const },
    { collection: "bankMoneyMoves", op: "insertOne" as const },
  ])("recovers a landed $collection.$op interruption", async (point) => {
    const { db, memory } = fixture();
    const fault = withInjectedCrash(memory, { ...point, onCall: 1, afterWrite: true });
    await expect(processCrisisScars(fault.db, 10)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect((await db.collection("federalBudget").findOne({}))?.investorConfidence).toBe(70);
    expect((await db.collection("crises").findOne({}))?.v2.lastScarTurn).toBeUndefined();
    const result = await processCrisisScars(db, 10);
    expect(result).toEqual({ advanced: 1, failed: 0 });
    const after = await db.collection("federalBudget").findOne({});
    expect(after!.investorConfidence).toBeLessThan(70);
    expect(await processCrisisScars(db, 10)).toEqual(result);
    expect(await db.collection("federalBudget").findOne({})).toEqual(after);
    await processCrisisScars(db, 20);
    expect((await db.collection("federalBudget").findOne({}))!.investorConfidence).toBeGreaterThan(
      after!.investorConfidence
    );
  });
  it("overlapping passes deliver the original loss once", async () => {
    const { db } = fixture();
    const [a, b] = await Promise.all([processCrisisScars(db, 10), processCrisisScars(db, 10)]);
    expect(a).toEqual(b);
    expect(await db.collection("bankMoneyMoves").countDocuments({})).toBe(1);
    expect((await db.collection("crises").findOne({}))!.v2.scars[0].applied).toBe(0.02);
  });
});
