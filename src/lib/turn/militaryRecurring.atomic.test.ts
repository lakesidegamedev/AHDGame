import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { applyStateArmsProduction } from "./stateArmsTurn";
import { applyReinforcement } from "./reinforcement";
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 10, worldEpochId: "synthetic-military", preset: "1953-default" },
  ]);
  f.memory.seed("states", [{ _id: "CEN", countryId: "RU", population: 1000000 }]);
  f.memory.seed("nationalArsenal", [
    {
      _id: new ObjectId(),
      countryId: "RU",
      stock: { ground: 0, naval: 0, air: 0, rocket: 0, space: 0, marine: 0 },
      grade: { ground: 0, naval: 0, air: 0, rocket: 0, space: 0, marine: 0 },
    },
  ]);
  f.memory.seed("nationalManpower", [
    { _id: new ObjectId(), countryId: "RU", pool: 10000, mode: "trained" },
  ]);
  f.memory.seed("militaryUnits", [
    {
      _id: new ObjectId(),
      countryId: "RU",
      domain: "ground",
      type: "Infantry Division",
      personnel: 6000,
      vet: 2,
      xp: 50,
      equipment: { firepower: 0, protection: 0, support: 0 },
    },
  ]);
  return f;
}
describe("state military flow replay", () => {
  it.each([
    { collection: "nationalArsenal", op: "updateOne" as const },
    { collection: "bankMoneyMoves", op: "insertOne" as const },
  ])("state production restores landed $collection.$op", async (point) => {
    const { db, memory } = fixture(),
      before = await db.collection("nationalArsenal").findOne({});
    const fault = withInjectedCrash(memory, { ...point, onCall: 1, afterWrite: true });
    await expect(applyStateArmsProduction(fault.db, "RU", undefined, 11)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(await db.collection("nationalArsenal").findOne({})).toEqual(before);
    const first = await applyStateArmsProduction(db, "RU", undefined, 11);
    expect(first.lots).toBeGreaterThan(0);
    const stock = await db.collection("nationalArsenal").findOne({});
    expect(await applyStateArmsProduction(db, "RU", undefined, 11)).toEqual(first);
    expect(await db.collection("nationalArsenal").findOne({})).toEqual(stock);
  });
  it.each([
    { collection: "militaryUnits", op: "bulkWrite" as const },
    { collection: "nationalManpower", op: "updateOne" as const },
    { collection: "bankMoneyMoves", op: "insertOne" as const },
  ])("reinforcement restores landed $collection.$op", async (point) => {
    const { db, memory } = fixture(),
      before = await db.collection("militaryUnits").findOne({});
    const fault = withInjectedCrash(memory, { ...point, onCall: 1, afterWrite: true });
    await expect(applyReinforcement(fault.db, "RU", undefined, 11)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(await db.collection("militaryUnits").findOne({})).toEqual(before);
    expect((await db.collection("nationalManpower").findOne({}))!.pool).toBe(10000);
    const first = await applyReinforcement(db, "RU", undefined, 11);
    expect(first.drawn).toBeGreaterThan(0);
    const after = await db.collection("militaryUnits").findOne({});
    expect(await applyReinforcement(db, "RU", undefined, 11)).toEqual(first);
    expect(await db.collection("militaryUnits").findOne({})).toEqual(after);
  });
  it("overlapping reinforcement uses one regeneration and one roster snapshot", async () => {
    const { db } = fixture();
    const [a, b] = await Promise.all([
      applyReinforcement(db, "RU", undefined, 11),
      applyReinforcement(db, "RU", undefined, 11),
    ]);
    expect(a).toEqual(b);
    expect((await db.collection("militaryUnits").findOne({}))!.personnel).toBe(6000 + a.drawn);
    expect((await db.collection("nationalManpower").findOne({}))!.pool).toBe(
      10000 + a.regenerated - a.drawn
    );
  });
});
