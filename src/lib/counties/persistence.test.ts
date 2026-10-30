import { describe, it, expect } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { seedCountyPopulations } from "./seed";
import { loadCountyPopulationMap } from "./queries";
import {
  freezeAndApplyDemographicFlowPlan,
  resumeDemographicFlowReceipt,
  type DemographicFlowRegionInput,
} from "@/lib/demographics/flowJournal";
import { migration } from "@/lib/migrations/entries/2026-10-30-county-populations";
function fixture() {
  const db = createInMemoryDb();
  db.seed("states", [{ _id: "WY", countryId: "US", population: 10000 }]);
  db.seed("gameState", [{ _id: "current", worldEpochId: "county-world", currentTurn: 1 }]);
  db.seed("regionDemographics", [
    { _id: "WY", countryId: "US", ages: { male: Array(101).fill(0), female: Array(101).fill(0) } },
  ]);
  db.seed("macroMetrics", [{ _id: "WY" }]);
  return db;
}
function plan(population: number): DemographicFlowRegionInput {
  const male = Array<number>(101).fill(0);
  male[30] = population;
  return {
    regionId: "WY",
    agesAfter: { male, female: Array(101).fill(0) },
    stateAfter: {
      population,
      votingEligiblePopulation: population,
      workingAgePopulation: population,
      militaryServicePopulation: 0,
    },
    metricsAfter: {
      realizedMigrationRate: 0,
      populationGrowth: 0,
      medianAge: 30,
      sexRatio: 100,
      dependencyRatio: 0,
      demographicDecline: 0,
    },
  };
}
function total(db: ReturnType<typeof fixture>) {
  return db.collection("counties").docs.reduce((n, c) => n + Number(c.population), 0);
}
describe("persisted county population lifecycle", () => {
  it("migrates without changing state headcounts, is idempotent, and honors dry run", async () => {
    const db = fixture(),
      target = db as unknown as Db;
    await migration.execute(target, { dryRun: true });
    expect(db.collection("counties").docs).toHaveLength(0);
    await migration.execute(target, { dryRun: false });
    expect(db.collection("counties").docs).toHaveLength(23);
    expect(total(db)).toBe(10000);
    const stock = structuredClone(db.collection("counties").docs);
    await migration.execute(target, { dryRun: false });
    expect(db.collection("counties").docs).toEqual(stock);
    expect(db.collection("states").docs[0].population).toBe(10000);
    expect((await loadCountyPopulationMap(target, "WY")).size).toBe(23);
  });
  it("rebuilds reset stocks and clears prior-world county stamps", async () => {
    const db = fixture(),
      target = db as unknown as Db;
    await seedCountyPopulations(target);
    db.collection("counties").docs[0].population = 999999;
    db.collection("counties").docs[0].populationFlowStamp = {
      worldEpochId: "old",
      turn: 88,
      batchId: "old",
    };
    db.collection("states").docs[0].population = 5000;
    await seedCountyPopulations(target, { replace: true });
    expect(total(db)).toBe(5000);
    expect(db.collection("counties").docs.every((c) => !c.populationFlowStamp)).toBe(true);
  });
  it("rejects absent or inconsistent county coverage before publishing a receipt", async () => {
    const db = fixture(),
      target = db as unknown as Db;
    await expect(
      freezeAndApplyDemographicFlowPlan(target, {
        worldEpochId: "county-world",
        turn: 2,
        regions: [plan(10020)],
        stats: { regionsProcessed: 1, circuitBreakerTrips: 0 },
      })
    ).rejects.toThrow("not initialized");
    expect(db.collection("demographicFlowReceipts").docs).toHaveLength(0);
    await seedCountyPopulations(target);
    db.collection("counties").docs[0].population = 0;
    await expect(
      freezeAndApplyDemographicFlowPlan(target, {
        worldEpochId: "county-world",
        turn: 2,
        regions: [plan(10020)],
        stats: { regionsProcessed: 1, circuitBreakerTrips: 0 },
      })
    ).rejects.toThrow("inconsistent");
  });
  it.each(["partial-counties", "after-counties"])(
    "recovers %s from frozen stocks without applying growth twice",
    async (failure) => {
      const db = fixture(),
        target = db as unknown as Db;
      await seedCountyPopulations(target);
      const counties = db.collection("counties"),
        states = db.collection("states");
      const original = (failure === "partial-counties" ? counties : states).bulkWrite.bind(
        failure === "partial-counties" ? counties : states
      );
      let first = true;
      (failure === "partial-counties" ? counties : states).bulkWrite = async (...args) => {
        if (first) {
          first = false;
          if (failure === "partial-counties") await original([args[0][0]]);
          throw new Error("injected county recovery failure");
        }
        return original(...args);
      };
      await expect(
        freezeAndApplyDemographicFlowPlan(target, {
          worldEpochId: "county-world",
          turn: 2,
          regions: [plan(10123)],
          stats: { regionsProcessed: 1, circuitBreakerTrips: 0 },
        })
      ).rejects.toThrow("injected county recovery");
      expect(states.docs[0].population).toBe(10000);
      await resumeDemographicFlowReceipt(target, "county-world", 2);
      expect(total(db)).toBe(10123);
      expect(states.docs[0].population).toBe(10123);
      const stocks = structuredClone(counties.docs);
      await freezeAndApplyDemographicFlowPlan(target, {
        worldEpochId: "county-world",
        turn: 2,
        regions: [plan(99000)],
        stats: { regionsProcessed: 1, circuitBreakerTrips: 0 },
      });
      expect(counties.docs).toEqual(stocks);
      await freezeAndApplyDemographicFlowPlan(target, {
        worldEpochId: "county-world",
        turn: 3,
        regions: [plan(9800)],
        stats: { regionsProcessed: 1, circuitBreakerTrips: 0 },
      });
      expect(total(db)).toBe(9800);
      expect(states.docs[0].population).toBe(9800);
    }
  );
  it("refuses migration while an unfinished demographic receipt exists", async () => {
    const db = fixture();
    db.seed("demographicFlowReceipts", [{ _id: "pending", status: "ready" }]);
    await expect(migration.execute(db as unknown as Db, { dryRun: false })).rejects.toThrow(
      "pending demographic"
    );
    expect(db.collection("counties").docs).toHaveLength(0);
  });
  it("validates corrupt existing stocks even in migration dry run", async () => {
    const db = fixture(),
      target = db as unknown as Db;
    await seedCountyPopulations(target);
    db.collection("counties").docs[0].population = 999999;
    await expect(migration.execute(target, { dryRun: true })).rejects.toThrow("mismatch");
  });
  it("rejects a later county watermark instead of overwriting newer population", async () => {
    const db = fixture(),
      target = db as unknown as Db;
    await seedCountyPopulations(target);
    db.collection("counties").docs[0].populationFlowStamp = {
      worldEpochId: "county-world",
      turn: 9,
      batchId: "later",
    };
    await expect(
      freezeAndApplyDemographicFlowPlan(target, {
        worldEpochId: "county-world",
        turn: 2,
        regions: [plan(10001)],
        stats: { regionsProcessed: 1, circuitBreakerTrips: 0 },
      })
    ).rejects.toThrow();
    expect(db.collection("states").docs[0].population).toBe(10000);
  });
});
