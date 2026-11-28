import { describe, expect, it } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { applyCapacityDestructionSpec } from "./capacityDestruction";
import { YUGOSLAV_ESCALATION_CAPACITY_DESTRUCTION } from "./rules/capacityDestruction";
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 200 }]);
  f.memory.seed("states", [
    { _id: "YU_CRO", name: "Croatia", countryId: "YU", capitalStock: 4000, gdp: 1000 },
  ]);
  const request = {
    spec: YUGOSLAV_ESCALATION_CAPACITY_DESTRUCTION,
    conflictKey: "synthetic",
    resolutionId: "resolution",
    outcomeId: "war",
    outcomeLabel: "War",
  };
  return { ...f, request };
}
describe("capacity damage receipts", () => {
  it("replays the original modeled damage and skipped regions after capital changes", async () => {
    const f = fixture();
    const original = await applyCapacityDestructionSpec(f.db, f.request);
    expect(original!.regions[0].destroyedCapital).toBe(20);
    await f.db
      .collection("states")
      .updateOne({ _id: "YU_CRO" } as never, { $set: { capitalStock: 8000 } });
    expect(await applyCapacityDestructionSpec(f.db, f.request)).toEqual(original);
    expect(f.memory.collection("conflictCapacityObligations").docs[0].destroyedCapital).toBe(20);
  });
  it.each([false, true])(
    "rolls back an interrupted obligations batch before retry, afterWrite=%s",
    async (afterWrite) => {
      const f = fixture();
      const fault = withInjectedCrash(f.memory, {
        collection: "conflictCapacityObligations",
        op: "bulkWrite",
        onCall: 1,
        afterWrite,
      });
      await expect(applyCapacityDestructionSpec(fault.db, f.request)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(f.memory.collection("conflictCapacityObligations").docs).toHaveLength(0);
      await Promise.all([
        applyCapacityDestructionSpec(f.db, f.request),
        applyCapacityDestructionSpec(f.db, f.request),
      ]);
      expect(f.memory.collection("conflictCapacityObligations").docs).toHaveLength(1);
    }
  );
});
