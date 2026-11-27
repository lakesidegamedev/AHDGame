import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { applyGroupSynergies } from "./applySynergies";
const root = "240000000000000000000001",
  child = "240000000000000000000002";
vi.mock("./groupMembership", () => ({
  resolveFormalizedGroups: async () => ({
    membersByRootId: new Map([
      ["240000000000000000000001", ["240000000000000000000001", "240000000000000000000002"]],
    ]),
  }),
}));
it("rolls back a landed strength transfer and replays the original turn once", async () => {
  const { memory } = createTransactionalMemoryDb();
  memory.seed("gameState", [{ _id: "current", currentTurn: 5 }]);
  memory.seed("gameConfig", [{ _id: "default", strengthUpkeepStage: 2 }]);
  const original = [
    { _id: new ObjectId(root), marketingStrength: 100, logisticsStrength: 50 },
    { _id: new ObjectId(child), marketingStrength: 5, logisticsStrength: 10 },
  ];
  memory.seed("corporations", original);
  const fault = withInjectedCrash(memory, {
    collection: "corporations",
    op: "bulkWrite",
    onCall: 1,
    afterWrite: true,
  });
  await expect(applyGroupSynergies(fault.db, 5)).rejects.toThrow();
  expect(fault.crashed).toBe(true);
  expect(memory.collection("corporations").docs).toEqual(original);
  const settled = await applyGroupSynergies(fault.db, 5);
  const snapshot = structuredClone(memory.collection("corporations").docs);
  expect(snapshot.reduce((sum, row) => sum + Number(row.marketingStrength), 0)).toBeCloseTo(105);
  expect(snapshot.reduce((sum, row) => sum + Number(row.logisticsStrength), 0)).toBeCloseTo(60);
  expect(await applyGroupSynergies(fault.db, 5)).toEqual(settled);
  expect(memory.collection("corporations").docs.map((row) => row.marketingStrength)).toEqual(
    snapshot.map((row) => row.marketingStrength)
  );
});
