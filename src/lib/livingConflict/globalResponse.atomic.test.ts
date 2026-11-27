import { it, expect, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { resolveGlobalResponse } from "./globalResponse";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/wireEvent", () => ({ logWireEvent: vi.fn() }));
vi.mock("./civilianLoss", () => ({ prepareConflictCivilianLossOrder: async () => null }));
vi.mock("./sanctions/apply", () => ({ applyCrisisTradeSanctions: vi.fn() }));
vi.mock("./capacityDestruction", () => ({ applyConflictCapacityDestruction: async () => null }));
vi.mock("@/lib/crises/applyEffects", () => ({
  applyCrisisEffects: async (db: Db, _effects: unknown, _states: unknown, countries: string[]) => {
    await db.collection("states").updateOne({ countryId: countries[0] }, { $inc: { approval: 1 } });
  },
}));
it("rolls back the terminal outcome with both role effects and replays once", async () => {
  const f = createTransactionalMemoryDb(),
    crisisId = new ObjectId(),
    interactionId = new ObjectId();
  f.memory.seed("crises", [
    {
      _id: crisisId,
      globalResponse: {
        conflictKey: "test",
        roleByCountry: { US: "a", CA: "b" },
        defaultOutcomeId: "success",
        outcomes: [
          {
            outcomeId: "success",
            label: "Success",
            description: "Done",
            conditions: [],
            priority: 1,
            wireMessage: "Done",
            effectsByRole: { a: [{ targetType: "approval" }], b: [{ targetType: "approval" }] },
          },
        ],
      },
    },
  ]);
  f.memory.seed("crisisInteractions", [
    { _id: interactionId, crisisId, leaderResponses: [], decisionTree: [] },
  ]);
  f.memory.seed("states", [
    { _id: "TX", countryId: "US", approval: 50 },
    { _id: "ON", countryId: "CA", approval: 50 },
  ]);
  const fault = withInjectedCrash(f.memory, {
    collection: "states",
    op: "updateOne",
    onCall: 2,
    afterWrite: true,
  });
  await expect(resolveGlobalResponse(fault.db, crisisId)).rejects.toThrow(
    "crash after states.updateOne"
  );
  expect(fault.crashed).toBe(true);
  expect(f.memory.collection("crisisInteractions").docs[0].globalResponseOutcome).toBeUndefined();
  expect(f.memory.collection("states").docs.map((row) => row.approval)).toEqual([50, 50]);
  await Promise.all([resolveGlobalResponse(f.db, crisisId), resolveGlobalResponse(f.db, crisisId)]);
  expect(f.memory.collection("states").docs.map((row) => row.approval)).toEqual([51, 51]);
});
