import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { createCrisisInstance } from "@/lib/crises/v2/instance";
import { makeDefinition } from "@/lib/crises/v2/testFixtures";
import { stanceLeversFor } from "@/lib/crises/v2/stanceLevers";
import {
  registerCrisisDefinition,
  registerCrisisEffectModule,
  resetCrisisV2RegistryForTests,
} from "./crisisV2/registry";
import { processCrisisV2Turn } from "./crisisV2Turn";
vi.mock("./crisisV2/nppResponse", () => ({ runNppCrisisResponse: vi.fn(async () => {}) }));
vi.mock("./crisisV2/scarsShell", () => ({ processCrisisScars: vi.fn(async () => {}) }));
vi.mock("./crisisV2/intents", () => ({
  routeEffectIntents: vi.fn(async (db: Db) => {
    await db
      .collection<{ _id: string; points: number }>("macroMetrics")
      .updateOne({ _id: "US" }, { $inc: { points: 1 } });
    return { applied: 1, unsupported: {} };
  }),
}));
describe("crisis effect and stance atomicity", () => {
  beforeEach(() => {
    resetCrisisV2RegistryForTests();
    vi.clearAllMocks();
  });
  it.each(["stance", "state"])(
    "restores claim, stance and effects after %s publication fails",
    async (boundary) => {
      const { memory } = createTransactionalMemoryDb();
      const definition = makeDefinition({
        id: "second_pandemic",
        levers: stanceLeversFor("second_pandemic"),
        effectModules: [{ moduleId: "atomic-effects" }],
      });
      registerCrisisDefinition(definition);
      registerCrisisEffectModule({
        id: "atomic-effects",
        evaluate: () => [{ kind: "approval", delta: -1 }],
      });
      const id = new ObjectId();
      const v2 = {
        ...createCrisisInstance(definition, 0),
        stage: "peak",
        stageStartTurn: 1,
        severity: 60,
      };
      memory.seed("gameState", [{ _id: "current", currentTurn: 5 }]);
      memory.seed("states", [{ _id: "TX", countryId: "US" }]);
      memory.seed("macroMetrics", [{ _id: "US", countryId: "US", points: 0 }]);
      memory.seed("crises", [
        {
          _id: id,
          status: "active",
          name: "Fixture",
          scope: "country",
          countryIds: ["US"],
          regionIds: [],
          startTurn: 0,
          effects: [],
          v2,
        },
      ]);
      memory.seed("crisisLeverUses", [
        {
          _id: new ObjectId(),
          crisisId: id,
          leverId: "lockdown",
          holderId: "head-1",
          intensity: 1,
          countryId: "US",
          appliedTurn: null,
          chargeState: "paid",
          turn: 5,
        },
      ]);
      const fault = withInjectedCrash(
        memory,
        boundary === "stance"
          ? { collection: "macroMetrics", op: "updateOne", onCall: 2, afterWrite: true }
          : { collection: "crises", op: "bulkWrite", onCall: 1, afterWrite: true }
      );
      expect((await processCrisisV2Turn(fault.db, 5, { pauseOpenings: true })).failed).toBe(1);
      expect(fault.crashed).toBe(true);
      expect(memory.collection("macroMetrics").docs[0].points).toBe(0);
      expect(memory.collection("crisisLeverUses").docs[0].appliedTurn).toBe(null);
      expect(memory.collection("crises").docs[0].v2).toMatchObject({ severity: 60 });
      expect(memory.collection("crises").docs[0].v2).not.toHaveProperty("lastEvaluatedTurn", 5);
      expect((await processCrisisV2Turn(fault.db, 5, { pauseOpenings: true })).processed).toBe(1);
      expect(memory.collection("macroMetrics").docs[0].points).toBe(2);
      expect(memory.collection("crisisLeverUses").docs[0].appliedTurn).toBe(5);
      expect((await processCrisisV2Turn(fault.db, 5, { pauseOpenings: true })).processed).toBe(0);
      expect(memory.collection("macroMetrics").docs[0].points).toBe(2);
    }
  );
});
