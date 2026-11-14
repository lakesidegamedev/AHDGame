import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import manifest from "@/data/subdivisions/ca/manifest.json";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { loadSubdivisionFile } from "@/lib/maps/subdivisionData";
import { getSubdivisionMode } from "@/lib/maps/subdivisionConfig";
import { subdivisionRegionMatchesCountry } from "@/lib/maps/rules/region";
import { seedCountyPopulations } from "@/lib/counties/seed";
import { countyCountryForId } from "@/lib/counties/rules";
import {
  freezeAndApplyDemographicFlowPlan,
  resumeDemographicFlowReceipt,
} from "@/lib/demographics/flowJournal";
import { caRegions2027 } from "./data/caRegions2027";
import { CA_GEOGRAPHY_REGIONS } from "./rules/localGeography";
import { migration } from "@/lib/migrations/entries/2026-11-14-canadian-census-divisions";

function fixture() {
  const memory = createInMemoryDb();
  memory.seed(
    "states",
    caRegions2027.map((s) => ({ ...structuredClone(s) }))
  );
  memory.seed("gameState", [
    { _id: "current", preset: "2027-default", worldEpochId: "ca-map", currentTurn: 1 },
  ]);
  memory.seed(
    "regionDemographics",
    caRegions2027.map((s) => ({
      _id: s._id,
      countryId: "CA",
      ages: { male: Array(101).fill(0), female: Array(101).fill(0) },
    }))
  );
  memory.seed(
    "macroMetrics",
    caRegions2027.map((s) => ({ _id: s._id }))
  );
  return memory;
}

describe("qualified Canadian local geography", () => {
  it("refuses live population initialization while turns or demographic recovery are running", async () => {
    const memory = fixture();
    const db = memory as unknown as Db;
    for (const field of ["isActive", "isProcessing"]) {
      Object.assign(memory.collection("gameState").docs[0], { [field]: true });
      await expect(migration.execute(db, { dryRun: false })).rejects.toThrow("Pause turns");
      Object.assign(memory.collection("gameState").docs[0], { [field]: false });
    }
    memory.seed("demographicFlowReceipts", [{ _id: "pending", status: "ready" }]);
    await expect(migration.execute(db, { dryRun: false })).rejects.toThrow("pending demographic");
    expect(memory.collection("counties").docs).toHaveLength(0);
  });

  it("covers every province with distinct census divisions and federal ridings", async () => {
    let cds = 0,
      ridings = 0,
      cdPopulation = 0,
      ridingPopulation = 0;
    const ids = new Set<string>();
    for (const region of caRegions2027) {
      const divisions = await loadSubdivisionFile("subdivisions/ca/census-divisions", region._id, {
        preset: "2027-default",
      });
      const districts = await loadSubdivisionFile("subdivisions/ca/federal-ridings", region._id, {
        preset: "2027-default",
      });
      expect(districts!.subdivisions).toHaveLength(region.houseDistricts);
      for (const [file, prefix] of [
        [divisions!, "CA-CD-2021-"],
        [districts!, "CA-FED-2023-"],
      ] as const) {
        expect(file.subdivisions.length).toBeGreaterThan(0);
        for (const unit of file.subdivisions) {
          expect(unit.id.startsWith(prefix)).toBe(true);
          expect(ids.has(unit.id)).toBe(false);
          ids.add(unit.id);
          expect(unit.path).toMatch(/^M/);
          expect(unit.path).not.toMatch(/NaN|Infinity/);
          expect(unit.name).not.toMatch(/[—–]|Ã|�/);
        }
      }
      cds += divisions!.subdivisions.length;
      ridings += districts!.subdivisions.length;
      cdPopulation += divisions!.subdivisions.reduce((n, s) => n + s.electorate, 0);
      ridingPopulation += districts!.subdivisions.reduce(
        (n, s) => n + (s as typeof s & { population: number }).population,
        0
      );
    }
    expect([cds, ridings, cdPopulation, ridingPopulation]).toEqual([293, 343, 36991981, 36991981]);
    expect(manifest.sources).toHaveLength(5);
  });

  it("keeps Canada, California, provincial maps and historical presets separate", async () => {
    expect(subdivisionRegionMatchesCountry("CA", "CA_ON")).toBe(true);
    expect(subdivisionRegionMatchesCountry("US", "CA_ON")).toBe(false);
    expect(subdivisionRegionMatchesCountry("CA", "CA")).toBe(false);
    expect(subdivisionRegionMatchesCountry("US", "CA")).toBe(true);
    expect(subdivisionRegionMatchesCountry("CA", "../CA_ON")).toBe(false);
    expect(countyCountryForId("06001")).toBe("US");
    expect(countyCountryForId("CA-CD-2021-3506")).toBe("CA");
    expect(countyCountryForId("CA-FED-2023-35001")).toBeNull();
    expect(getSubdivisionMode("CA", "provincialLegislature")?.config.dataDir).toContain(
      "census-divisions"
    );
    expect(getSubdivisionMode("CA", "caCommons")?.config.dataDir).toContain("federal-ridings");
    expect(getSubdivisionMode("CA", "caSenate")).toBeNull();
    expect(
      await loadSubdivisionFile("subdivisions/ca/federal-ridings", "CA_ON", {
        preset: "1991-default",
      })
    ).toBeNull();
  });

  it("migrates idempotently and preserves US stocks and province totals through reset and demographic recovery", async () => {
    const memory = fixture(),
      db = memory as unknown as Db;
    memory.seed("counties", [{ _id: "06001", countryId: "US", stateId: "CA", population: 123 }]);
    await migration.execute(db, { dryRun: true });
    expect(memory.collection("counties").docs).toHaveLength(1);
    await migration.execute(db, { dryRun: false });
    await migration.execute(db, { dryRun: false });
    expect(memory.collection("counties").docs.filter((s) => s.countryId === "CA")).toHaveLength(
      293
    );
    for (const region of caRegions2027) {
      const rows = memory.collection("counties").docs.filter((s) => s.stateId === region._id);
      expect(rows.reduce((n, s) => n + Number(s.population), 0)).toBe(region.population);
      expect(rows.every((s) => s.populationBaseline === "ca-census-2021-proportional")).toBe(true);
    }
    const population = caRegions2027.find((s) => s._id === "CA_ON")!.population + 17;
    const male = Array<number>(101).fill(0);
    male[30] = population;
    await freezeAndApplyDemographicFlowPlan(db, {
      worldEpochId: "ca-map",
      turn: 2,
      regions: [
        {
          regionId: "CA_ON",
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
        },
      ],
      stats: { regionsProcessed: 1, circuitBreakerTrips: 0 },
    });
    await resumeDemographicFlowReceipt(db, "ca-map", 2);
    expect(
      memory
        .collection("counties")
        .docs.filter((s) => s.stateId === "CA_ON")
        .reduce((n, s) => n + Number(s.population), 0)
    ).toBe(population);
    for (const region of caRegions2027)
      Object.assign(
        memory.collection("states").docs.find((s) => s._id === region._id)!,
        region
      );
    await seedCountyPopulations(db, { replace: true, countryIds: ["CA"], preset: "2027-default" });
    expect(memory.collection("counties").docs.find((s) => s._id === "06001")?.population).toBe(123);
    expect(
      memory
        .collection("counties")
        .docs.filter((s) => s.countryId === "CA")
        .every((s) => !s.populationFlowStamp)
    ).toBe(true);
    expect(CA_GEOGRAPHY_REGIONS).toHaveLength(13);
  });
});
