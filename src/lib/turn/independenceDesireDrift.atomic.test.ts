import { expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { processIndependenceDesireDrift } from "./independenceDesireDrift";
vi.mock("@/lib/governorOffice/devolution/queries", () => ({
  loadIndependenceDesireSnapshots: async (db: Db) => {
    const row = await db.collection("macroMetrics").findOne({ _id: "SCO" } as never);
    const previous = row!.independenceDesire.value;
    return [{ stateId: "SCO", previous, next: previous + 0.1, delta: 0.1 }];
  },
}));
it("publishes drift and its proof together and replays the original signal", async () => {
  const { memory } = createTransactionalMemoryDb();
  memory.seed("gameState", [{ _id: "current", currentTurn: 5 }]);
  memory.seed("macroMetrics", [{ _id: "SCO", independenceDesire: { value: 20, trend: 0 } }]);
  const fault = withInjectedCrash(memory, {
    collection: "macroMetrics",
    op: "bulkWrite",
    onCall: 1,
    afterWrite: true,
  });
  await expect(processIndependenceDesireDrift(fault.db, 5)).rejects.toThrow();
  expect(fault.crashed).toBe(true);
  expect(memory.collection("macroMetrics").docs[0].independenceDesire).toEqual({
    value: 20,
    trend: 0,
  });
  const settled = await processIndependenceDesireDrift(fault.db, 5);
  expect(memory.collection("macroMetrics").docs[0].independenceDesire).toEqual({
    value: 20.1,
    trend: 0.1,
  });
  expect(await processIndependenceDesireDrift(fault.db, 5)).toEqual(settled);
  expect(memory.collection("macroMetrics").docs[0].independenceDesire).toEqual({
    value: 20.1,
    trend: 0.1,
  });
});
