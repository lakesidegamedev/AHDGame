import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { seedUKRegions } from "@/lib/countries/uk/seed";
import { seedJPRegions } from "@/lib/countries/jp/seed";
import { regionBundleFor } from "@/lib/admin/seedDiagnostic/regionBundles";
import { seedCountyPopulations } from "./seed";
import { loadCountyPopulationMap } from "./queries";
import { loadPopulationSubdivisionReference } from "./subdivisionReference";
import { countyCountryForId } from "./rules";
import {
  freezeAndApplyDemographicFlowPlan,
  resumeDemographicFlowReceipt,
  type DemographicFlowRegionInput,
} from "@/lib/demographics/flowJournal";
import { migration } from "@/lib/migrations/entries/2026-11-01-uk-jp-subdivision-populations";
import { HELD_MIGRATIONS, MIGRATIONS } from "@/lib/migrations/registry";
import { SINGLEPLAYER_MIGRATIONS } from "@/lib/migrations/singleplayerMigrations";

const presets = ["1953", "1979", "1991", "1999", "2007", "2019", "2023", "2027"];
function fixture(preset = "2019-default") {
  const db = createInMemoryDb();
  db.seed(
    "states",
    [...regionBundleFor("UK", preset)!, ...regionBundleFor("JP", preset)!].map((s) => ({ ...s }))
  );
  db.seed("gameState", [{ _id: "current", preset, worldEpochId: "international", currentTurn: 1 }]);
  db.seed(
    "regionDemographics",
    db.collection("states").docs.map((s) => ({
      _id: s._id,
      countryId: s.countryId,
      ages: { male: Array(101).fill(0), female: Array(101).fill(0) },
    }))
  );
  db.seed(
    "macroMetrics",
    db.collection("states").docs.map((s) => ({ _id: s._id }))
  );
  return db;
}
function plan(regionId: string, population: number): DemographicFlowRegionInput {
  const male = Array<number>(101).fill(0);
  male[30] = population;
  return {
    regionId,
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
function assertRollups(db: ReturnType<typeof fixture>) {
  for (const state of db.collection("states").docs) {
    const rows = db.collection("counties").docs.filter((c) => c.stateId === state._id);
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every(
        (c) =>
          c.countryId === state.countryId &&
          Number.isSafeInteger(c.population) &&
          Number(c.population) >= 0
      )
    ).toBe(true);
    expect(rows.reduce((n, c) => n + Number(c.population), 0)).toBe(state.population);
  }
  for (const countryId of ["UK", "JP"])
    expect(
      db
        .collection("counties")
        .docs.filter((c) => c.countryId === countryId)
        .reduce((n, c) => n + Number(c.population), 0)
    ).toBe(
      db
        .collection("states")
        .docs.filter((s) => s.countryId === countryId)
        .reduce((n, s) => n + Number(s.population), 0)
    );
}

describe("international population subdivisions", () => {
  it.each(presets)(
    "resets all 697 subdivisions from %s regional totals and conserves subsequent demographic flows",
    async (era) => {
      const db = fixture(`${era}-default`),
        target = db as unknown as Db;
      await seedUKRegions(target, true, () => {}, `${era}-default`);
      await seedJPRegions(target, true, () => {}, `${era}-default`);
      await seedCountyPopulations(target, { replace: true });
      expect(db.collection("counties").docs.filter((c) => c.countryId === "UK")).toHaveLength(650);
      expect(db.collection("counties").docs.filter((c) => c.countryId === "JP")).toHaveLength(47);
      assertRollups(db);
      const initial = structuredClone(db.collection("counties").docs);
      await seedCountyPopulations(target);
      expect(db.collection("counties").docs).toEqual(initial);
      for (const row of db.collection("counties").docs) {
        row.population = 1;
        row.populationFlowStamp = { worldEpochId: "old", turn: 99, batchId: "old" };
      }
      db.collection("counties").docs.push({
        _id: "JP-99",
        countryId: "JP",
        stateId: "HOK",
        population: 4,
      });
      await seedCountyPopulations(target, { replace: true });
      expect(db.collection("counties").docs).toEqual(initial);
      const regions = db
        .collection("states")
        .docs.map((s, i) => plan(String(s._id), Number(s.population) + (i % 2 ? -17 : 23)));
      await freezeAndApplyDemographicFlowPlan(target, {
        worldEpochId: "international",
        turn: 2,
        regions,
        stats: { regionsProcessed: 20, circuitBreakerTrips: 0 },
      });
      assertRollups(db);
      const done = structuredClone(db.collection("counties").docs);
      await seedUKRegions(target, false, () => {}, `${era}-default`);
      await seedJPRegions(target, false, () => {}, `${era}-default`);
      await seedCountyPopulations(target);
      assertRollups(db);
      await resumeDemographicFlowReceipt(target, "international", 2);
      expect(db.collection("counties").docs).toEqual(done);
    }
  );
  it("leaves newly acquired regions outside the authored UK/JP map roster untouched", async () => {
    const db = fixture(),
      target = db as unknown as Db;
    db.collection("states").docs.push({ _id: "DUB", countryId: "UK", population: 1000 });
    await seedCountyPopulations(target);
    expect(db.collection("counties").docs).toHaveLength(697);
    expect(db.collection("states").docs.find((s) => s._id === "DUB")!.population).toBe(1000);
  });
  it("uses stable disjoint identifiers, exact map rosters and honest baseline labels", async () => {
    const db = fixture(),
      target = db as unknown as Db;
    await seedCountyPopulations(target);
    for (const s of db.collection("states").docs) {
      const countryId = s.countryId as "UK" | "JP";
      const reference = await loadPopulationSubdivisionReference(String(s._id), countryId);
      const stocks = await loadCountyPopulationMap(target, String(s._id), countryId);
      expect([...stocks.keys()].sort()).toEqual(reference.map((r) => r.id).sort());
    }
    expect(
      db.collection("counties").docs.every((c) => countyCountryForId(String(c._id)) === c.countryId)
    ).toBe(true);
    expect(new Set(db.collection("counties").docs.map((c) => c.populationBaseline))).toEqual(
      new Set(["uk-electorate-2024-proportional", "jp-reference-2020-proportional"])
    );
    for (const id of ["JP-00", "JP-48", "JP-1", "../LON", "constructor", "E140000001"])
      expect(countyCountryForId(id)).toBeNull();
  });
  it("dry-runs and migrates UK/JP without changing US stocks or any state totals", async () => {
    const db = fixture(),
      target = db as unknown as Db;
    db.seed("counties", [{ _id: "56001", countryId: "US", stateId: "WY", population: 123 }]);
    const states = structuredClone(db.collection("states").docs);
    const dry = await migration.execute(target, { dryRun: true });
    expect(dry?.documentsScanned).toBe(697);
    expect(db.collection("counties").docs).toHaveLength(1);
    await migration.execute(target, { dryRun: false });
    const before = structuredClone(db.collection("counties").docs);
    await migration.execute(target, { dryRun: false });
    expect(db.collection("counties").docs).toEqual(before);
    expect(before.find((c) => c._id === "56001")?.population).toBe(123);
    expect(db.collection("states").docs).toEqual(states);
    expect(MIGRATIONS).not.toContain(migration);
    expect(HELD_MIGRATIONS).toContain(migration);
    expect(SINGLEPLAYER_MIGRATIONS).toContain(migration);
    db.seed("demographicFlowReceipts", [{ _id: "pending", status: "ready" }]);
    await expect(migration.execute(target, { dryRun: true })).rejects.toThrow("pending");
  });
  it.each(["LON", "KAN"])(
    "recovers a partially applied %s population change without doubling it",
    async (regionId) => {
      const db = fixture(),
        target = db as unknown as Db;
      await seedCountyPopulations(target);
      const counties = db.collection("counties"),
        bulk = counties.bulkWrite.bind(counties);
      let fail = true;
      counties.bulkWrite = async (...args) => {
        if (fail) {
          fail = false;
          await bulk(args[0].slice(0, 1));
          throw new Error("interrupted subdivision write");
        }
        return bulk(...args);
      };
      const state = db.collection("states").docs.find((s) => s._id === regionId)!;
      const population = Number(state.population) + 71;
      await expect(
        freezeAndApplyDemographicFlowPlan(target, {
          worldEpochId: "international",
          turn: 2,
          regions: [plan(regionId, population)],
          stats: { regionsProcessed: 1, circuitBreakerTrips: 0 },
        })
      ).rejects.toThrow("interrupted");
      expect(state.population).not.toBe(population);
      await resumeDemographicFlowReceipt(target, "international", 2);
      expect(state.population).toBe(population);
      assertRollups(db);
    }
  );
  it.each(["LON", "KAN"])(
    "rejects missing coverage and reassigned %s targets before publishing parent totals",
    async (regionId) => {
      const db = fixture(),
        target = db as unknown as Db;
      const state = db.collection("states").docs.find((s) => s._id === regionId)!;
      const args = {
        worldEpochId: "international",
        turn: 2,
        regions: [plan(regionId, Number(state.population) + 1)],
        stats: { regionsProcessed: 1, circuitBreakerTrips: 0 },
      };
      await expect(freezeAndApplyDemographicFlowPlan(target, args)).rejects.toThrow(
        "not initialized"
      );
      await seedCountyPopulations(target);
      const row = db.collection("counties").docs.find((c) => c.stateId === regionId)!;
      row.countryId = "US";
      await expect(freezeAndApplyDemographicFlowPlan(target, args)).rejects.toThrow("inconsistent");
      expect(db.collection("demographicFlowReceipts").docs).toHaveLength(0);
    }
  );
  it("repopulates an empty prefecture region with its saved baseline weights", async () => {
    const db = fixture(),
      target = db as unknown as Db;
    const state = db.collection("states").docs.find((s) => s._id === "KAN")!;
    state.population = 0;
    await seedCountyPopulations(target);
    await freezeAndApplyDemographicFlowPlan(target, {
      worldEpochId: "international",
      turn: 2,
      regions: [plan("KAN", 99)],
      stats: { regionsProcessed: 1, circuitBreakerTrips: 0 },
    });
    assertRollups(db);
  });
});
