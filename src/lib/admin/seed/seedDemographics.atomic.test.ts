import { describe, expect, it, vi } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { seedDemographics } from "./seedDemographics";
import { stateCensusData2027 } from "@/lib/seeds/stateCensusData2027";
import { generateStateDemographics } from "@/lib/seeds/stateDemographics";
import { calculateStateLeanForCache } from "@/lib/demographics/cachedStateLean";
vi.mock("@/lib/seeds/loadEraPositionOverride", () => ({ loadEraFullOverride: async () => null }));
const id = Object.keys(stateCensusData2027)[0];
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 77,
      currentYear: 2027,
      startingYear: 2027,
      preset: "2027-default",
    },
  ]);
  f.memory.seed("states", [
    { _id: id, countryId: "US", cachedEconomicLean: 123, cachedSocialLean: 123 },
  ]);
  f.memory.seed("stateDemographicTurnout", [
    { _id: "ON", countryId: "CA", modifiers: { age: { young: 11 } } },
  ]);
  return f;
}
describe("era-aware demographic top-up", () => {
  it.each(["stateDemographics", "demographicDefaults", "stateDemographicTurnout", "states"])(
    "rolls back landed %s and completes the same era on retry",
    async (collection) => {
      const f = fixture(),
        log = vi.fn();
      const fault = withInjectedCrash(f.memory, {
        collection,
        op: "bulkWrite",
        onCall: 1,
        afterWrite: true,
      });
      await expect(seedDemographics(fault.db, false, log)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(await f.db.collection("stateDemographics").countDocuments({})).toBe(0);
      expect((await f.db.collection("states").findOne({}))!.cachedEconomicLean).toBe(123);
      expect(log).not.toHaveBeenCalled();
      await seedDemographics(f.db, false, log);
      const expected = generateStateDemographics(id, stateCensusData2027[id], "2027", "US", {
        layer1Positions: true,
      });
      const { groups: _groups, lastUpdated: _lastUpdated, ...stored } = expected;
      expect(await f.db.collection("stateDemographics").findOne({ _id: id as never })).toEqual(
        expect.objectContaining(stored)
      );
      expect(
        (await f.db.collection("stateDemographicTurnout").findOne({ _id: "ON" as never }))!
          .modifiers.age.young
      ).toBe(11);
    }
  );
  it("preserves drift and turnout on repeated top-up and derives cache from those stored facts", async () => {
    const f = fixture();
    await seedDemographics(f.db, false, () => {});
    await f.db
      .collection("stateDemographics")
      .updateOne({ _id: id as never }, { $set: { syntheticDrift: 7 } });
    await f.db
      .collection("stateDemographicTurnout")
      .updateOne({ _id: id as never }, { $set: { modifiers: { age: { young: 9 } } } });
    const before = await f.db.collection("stateDemographics").findOne({ _id: id as never });
    const turnout = await f.db.collection("stateDemographicTurnout").findOne({ _id: id as never });
    await Promise.all([
      seedDemographics(f.db, false, () => {}),
      seedDemographics(f.db, false, () => {}),
    ]);
    expect(await f.db.collection("stateDemographics").findOne({ _id: id as never })).toEqual(
      before
    );
    expect(await f.db.collection("stateDemographicTurnout").findOne({ _id: id as never })).toEqual(
      turnout
    );
    const baseline = await f.db.collection("demographicDefaults").findOne({ _id: id as never });
    const lean = calculateStateLeanForCache(before as never, [], {
      countryId: "US",
      stateId: id,
      preset: "2027-default",
      year: 2027,
      startingYear: 2027,
      demographicDefaults: baseline as never,
      turnoutDoc: turnout as never,
    });
    expect((await f.db.collection("states").findOne({}))!.cachedEconomicLean).toBe(
      lean.economicLean
    );
  });
  it("explicit reset changes only US rows and remains recoverable", async () => {
    const f = fixture();
    await seedDemographics(f.db, false, () => {});
    await f.db
      .collection("stateDemographicTurnout")
      .updateOne({ _id: id as never }, { $set: { modifiers: { age: { young: 9 } } } });
    const before = await f.db.collection("stateDemographicTurnout").findOne({ _id: id as never });
    const fault = withInjectedCrash(f.memory, {
      collection: "demographicDefaults",
      op: "deleteMany",
      onCall: 1,
      afterWrite: true,
    });
    await expect(seedDemographics(fault.db, true, () => {})).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(await f.db.collection("stateDemographicTurnout").findOne({ _id: id as never })).toEqual(
      before
    );
    await seedDemographics(f.db, true, () => {});
    expect(
      (await f.db.collection("stateDemographicTurnout").findOne({ _id: id as never }))!.modifiers
    ).toEqual({});
    expect(
      (await f.db.collection("stateDemographicTurnout").findOne({ _id: "ON" as never }))!.modifiers
        .age.young
    ).toBe(11);
  });
  it("refuses online top-ups during processing and rejects a different era", async () => {
    const f = fixture();
    await f.db
      .collection("gameState")
      .updateOne({ _id: "current" as never }, { $set: { isProcessing: true } });
    await expect(seedDemographics(f.db, false, () => {}, undefined, true)).rejects.toMatchObject({
      status: 409,
    });
    expect(await f.db.collection("stateDemographics").countDocuments({})).toBe(0);
    await f.db
      .collection("gameState")
      .updateOne({ _id: "current" as never }, { $set: { isProcessing: false } });
    await expect(
      seedDemographics(f.db, false, () => {}, "2019-default", true)
    ).rejects.toMatchObject({ status: 409 });
    await seedDemographics(f.db, false, () => {}, undefined, true);
    expect(await f.db.collection("stateDemographics").countDocuments({})).toBeGreaterThan(0);
  });
});
