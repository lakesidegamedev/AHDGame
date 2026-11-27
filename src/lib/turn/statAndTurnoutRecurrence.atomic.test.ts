import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import type { Character } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
let ownedDb: Db;
vi.mock("@/lib/mongodb", () => ({ getDb: async () => ownedDb }));
vi.mock("@/lib/achievements/officeHolders", () => ({
  awardOfficeHolderAchievements: vi.fn(async () => 0),
}));
import { awardOfficeHolderAchievements } from "@/lib/achievements/officeHolders";
import { processActionRefresh } from "./actionRefresh";
import { applyDecayToAllStates } from "@/lib/parties/playerTurnout";
import { processStatePolicyEffects } from "@/lib/policyEffects";
function fixture() {
  const f = createTransactionalMemoryDb();
  ownedDb = f.db;
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 100, preset: "2027-default", worldEpochId: "synthetic-stat" },
  ]);
  f.memory.seed("characters", [
    {
      _id: new ObjectId(),
      userId: new ObjectId(),
      countryId: "US",
      homeState: "CA",
      party: "1",
      currentOffice: null,
      actions: 10,
      politicalInfluence: 100,
      nationalInfluence: 50,
      favorability: 80,
      infamy: 10,
      cashOnHand: 1000,
    },
  ]);
  f.memory.seed("npps", [
    {
      _id: new ObjectId(),
      countryId: "US",
      homeState: "CA",
      party: "1",
      retiredAt: null,
      politicalInfluence: 100,
      favorability: 80,
    },
  ]);
  f.memory.seed("stateDemographicTurnout", [
    {
      _id: "CA",
      countryId: "US",
      modifiers: { race: { all: 10 } },
      campaignModifiers: { race: { all: 10 } },
      lastDecayApplied: new Date(0),
      lastUpdated: new Date(0),
    },
  ]);
  f.memory.seed("states", [{ _id: "SCO", countryId: "SCO", population: 1000000 }]);
  f.memory.seed("macroMetrics", [
    { _id: "SCO", countryId: "SCO", economic: { unemploymentRate: { value: 10, trend: 0 } } },
  ]);
  f.memory.seed("stateBaselines", [
    { _id: "SCO", baselines: { economic: { unemploymentRate: 5 } } },
  ]);
  return f;
}
async function refresh(db: Db) {
  ownedDb = db;
  const chars = await db.collection<Character>("characters").find({}).toArray();
  return processActionRefresh(chars, null, new Date(0), 101);
}
describe("actor refresh and turnout original inputs", () => {
  it.each([
    { collection: "characters", op: "bulkWrite" as const },
    { collection: "npps", op: "bulkWrite" as const },
    { collection: "bankMoneyMoves", op: "insertOne" as const },
  ])("refresh rolls back landed $collection.$op", async (point) => {
    const { db, memory } = fixture();
    vi.mocked(awardOfficeHolderAchievements).mockClear();
    const before = await db.collection("characters").findOne({});
    const fault = withInjectedCrash(memory, { ...point, onCall: 1, afterWrite: true });
    await expect(refresh(fault.db)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(await db.collection("characters").findOne({})).toEqual(before);
    expect(awardOfficeHolderAchievements).not.toHaveBeenCalled();
    await refresh(db);
    const after = await db.collection("characters").findOne({});
    expect(after!.actions).toBeGreaterThan(10);
    expect(after!.cashOnHand).toBe(1000);
    await refresh(db);
    expect(await db.collection("characters").findOne({})).toEqual(after);
    expect(awardOfficeHolderAchievements).toHaveBeenCalledTimes(1);
  });
  it("turnout's landed write keeps its turn stamp and does not decay again", async () => {
    const { db, memory } = fixture();
    const fault = withInjectedCrash(memory, {
      collection: "stateDemographicTurnout",
      op: "bulkWrite",
      onCall: 1,
      afterWrite: true,
    });
    await expect(applyDecayToAllStates(undefined, 101, fault.db)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    const after = await db.collection("stateDemographicTurnout").findOne({});
    expect(after!.modifiers.race.all).toBeLessThan(10);
    expect(after!.decayAppliedTurn).toBe(101);
    expect(await applyDecayToAllStates(undefined, 101, db)).toEqual([]);
    expect(await db.collection("stateDemographicTurnout").findOne({})).toEqual(after);
  });
  it("turnout decay does not overwrite a new canvassing credit", async () => {
    const { db, memory } = fixture(),
      col = memory.collection("stateDemographicTurnout"),
      bulk = col.bulkWrite.bind(col);
    vi.spyOn(col, "bulkWrite").mockImplementationOnce(async (ops) => {
      await col.updateOne({}, { $inc: { "modifiers.race.all": 5 } });
      return bulk(ops);
    });
    expect(await applyDecayToAllStates(undefined, 101, db)).toEqual([]);
    expect((await db.collection("stateDemographicTurnout").findOne({}))!.modifiers.race.all).toBe(
      15
    );
    expect(await applyDecayToAllStates(undefined, 101, db)).toHaveLength(1);
  });
  it("legacy macro policy drift recovers a failed write and advances only once", async () => {
    const { db, memory } = fixture(),
      before = await db.collection("macroMetrics").findOne({}),
      fault = withInjectedCrash(memory, {
        collection: "macroMetrics",
        op: "bulkWrite",
        onCall: 1,
        afterWrite: true,
      });
    await expect(processStatePolicyEffects(fault.db, [], 101)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(await db.collection("macroMetrics").findOne({})).toEqual(before);
    await processStatePolicyEffects(db, [], 101);
    const after = await db.collection("macroMetrics").findOne({});
    expect(after!.economic.unemploymentRate.value).toBeLessThan(10);
    await processStatePolicyEffects(db, [], 101);
    expect(await db.collection("macroMetrics").findOne({})).toEqual(after);
  });
});
