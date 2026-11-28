import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { ensureInitialEscalationState, processRegimeEscalationTurn } from "./regimeEscalationTurn";
const leader = new ObjectId();
async function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 9, worldEpochId: "synthetic-regime" },
  ]);
  await ensureInitialEscalationState(f.db, "CN", 1);
  await f.db
    .collection("regimeEscalation")
    .updateOne({ _id: "CN" as never }, { $set: { "dwellCounters.stage1": 11 } });
  const args = {
    db: f.db,
    countryId: "CN" as const,
    popularLegitimacy: 50,
    partyConfidence: 80,
    rulingLeaderCharacterId: leader,
    currentTurn: 10,
  };
  return { ...f, args };
}
describe("regime transition publication", () => {
  it.each([
    { collection: "regimeEscalation", op: "findOneAndUpdate" as const, onCall: 1 },
    { collection: "regimeEscalation", op: "findOneAndUpdate" as const, onCall: 2 },
    { collection: "countryHistory", op: "insertOne" as const, onCall: 1 },
    { collection: "bankMoneyMoves", op: "insertOne" as const, onCall: 1 },
  ])("restores stage, decision and dwell after $collection interruption", async (point) => {
    const f = await fixture();
    const before = await f.db.collection("regimeEscalation").findOne({});
    const fault = withInjectedCrash(f.memory, { ...point, afterWrite: true });
    await expect(processRegimeEscalationTurn({ ...f.args, db: fault.db })).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(await f.db.collection("regimeEscalation").findOne({})).toEqual(before);
    expect(await f.db.collection("countryHistory").countDocuments({})).toBe(0);
    const result = await processRegimeEscalationTurn(f.args);
    expect(result?.toStage).toBe("discontent");
    expect(await processRegimeEscalationTurn(f.args)).toEqual(result);
    const state = await f.db.collection("regimeEscalation").findOne({});
    expect(state!.dwellCounters.stage1).toBe(12);
    expect(state!.activeDecision.kind).toBe("stage1.addressDiscontent");
    expect(await f.db.collection("countryHistory").countDocuments({})).toBe(1);
  });
  it("concurrent resolution increments dwell and offers the decision once", async () => {
    const f = await fixture();
    const [a, b] = await Promise.all([
      processRegimeEscalationTurn(f.args),
      processRegimeEscalationTurn(f.args),
    ]);
    expect(a).toEqual(b);
    expect((await f.db.collection("regimeEscalation").findOne({}))!.decisionQueue).toHaveLength(0);
    expect(await f.db.collection("countryHistory").countDocuments({})).toBe(1);
  });
  it("self-healing retains an existing stage instead of returning an imaginary seed", async () => {
    const f = await fixture();
    await processRegimeEscalationTurn(f.args);
    expect((await ensureInitialEscalationState(f.db, "CN", 10)).currentStage).toBe("discontent");
  });
});
