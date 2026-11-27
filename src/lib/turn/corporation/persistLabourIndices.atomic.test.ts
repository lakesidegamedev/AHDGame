import { describe, expect, it } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { persistLabourIndices } from "./corporationTurnPhases";
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 9, worldEpochId: "synthetic-labour" },
  ]);
  f.memory.seed("macroMetrics", [
    { _id: "TX", economic: { labourWageIndex: { value: 1 }, automationIndex: { value: 1 } } },
  ]);
  return {
    ...f,
    args: {
      db: f.db,
      turn: 10,
      wagesEnabled: true,
      labourWageIndexByState: new Map([["TX", 1.2]]),
      automationIndexByState: new Map([["TX", 1.1]]),
    },
  };
}
describe("corporate labour prior publication", () => {
  it.each(["macroMetrics", "bankMoneyMoves"])(
    "retains original deltas across a landed %s interruption",
    async (collection) => {
      const f = fixture();
      const fault = withInjectedCrash(f.memory, { collection, onCall: 1, afterWrite: true });
      await expect(persistLabourIndices({ ...f.args, db: fault.db })).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(
        (await f.db.collection("macroMetrics").findOne({}))!.economic.labourWageIndex.value
      ).toBe(1);
      await persistLabourIndices(f.args);
      await persistLabourIndices(f.args);
      const e = (await f.db.collection("macroMetrics").findOne({}))!.economic;
      expect(e.labourWageIndexDelta.value).toBeCloseTo(0.2);
      expect(e.automationIndexDelta.value).toBeCloseTo(0.1);
    }
  );
  it("overlapping publishers preserve the first settled prior", async () => {
    const f = fixture();
    await Promise.all([persistLabourIndices(f.args), persistLabourIndices(f.args)]);
    expect(
      (await f.db.collection("macroMetrics").findOne({}))!.economic.labourWageIndexDelta.value
    ).toBeCloseTo(0.2);
    expect(await f.db.collection("bankMoneyMoves").countDocuments({})).toBe(1);
  });
});
