import type { ClientSession, Db } from "mongodb";
import { describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { materializeFederationTerritory } from "./materializeTerritory";

describe("federation territory materialization", () => {
  it("archives departed nested regions and active regional rows while preserving characters and retained territory", async () => {
    const mem = createInMemoryDb();
    mem.seed("states", [
      { _id: "RUSSIA", countryId: "RU", population: 10, gdp: 10 },
      { _id: "UKRAINE", countryId: "RU", population: 8, gdp: 8 },
      { _id: "KYIV", countryId: "RU", parentRegionId: "UKRAINE", population: 4, gdp: 4 },
    ]);
    mem.seed("statePolicies", [
      { _id: "ru-policy", stateId: "RUSSIA", countryId: "RU" },
      { _id: "ua-policy", stateId: "KYIV", countryId: "RU" },
    ]);
    mem.seed("corporateSectors", [{ _id: "ua-facility", stateId: "KYIV", countryId: "RU" }]);
    mem.seed("macroMetrics", [{ _id: "UKRAINE", countryId: "RU", value: 1 }]);
    mem.seed("stateRegistrationPool", [{ _id: "RU_KYIV", countryId: "RU", value: 1 }]);
    mem.seed("characters", [{ _id: "player", homeState: "KYIV", countryId: "RU" }]);
    const db = mem as unknown as Db;
    const result = await materializeFederationTerritory({
      db,
      session: {} as ClientSession,
      applicationId: "1991-default:ussr-split:1",
      sourceCountryId: "RU",
      transfers: [
        {
          stateId: "RUSSIA",
          parentRegionId: null,
          topLevelRegionId: "RUSSIA",
          successorEntityId: "RU",
          leavesDetailedSource: false,
        },
        {
          stateId: "UKRAINE",
          parentRegionId: null,
          topLevelRegionId: "UKRAINE",
          successorEntityId: "UKR",
          leavesDetailedSource: true,
        },
        {
          stateId: "KYIV",
          parentRegionId: "UKRAINE",
          topLevelRegionId: "UKRAINE",
          successorEntityId: "UKR",
          leavesDetailedSource: true,
        },
      ],
    });
    expect(result).toEqual({ statesArchived: 2, regionalRowsArchived: 4 });
    expect((await db.collection("states").find({}).toArray()).map((row) => row._id)).toEqual([
      "RUSSIA",
    ]);
    expect((await db.collection("statePolicies").find({}).toArray()).map((row) => row._id)).toEqual(
      ["ru-policy"]
    );
    expect(await db.collection("characters").countDocuments({ homeState: "KYIV" })).toBe(1);
    expect(
      (await db.collection("federationArchivedRegionRows").find({}).toArray()).map((row) => [
        row.collection,
        row.originalId,
        row.successorEntityId,
      ])
    ).toEqual([
      ["states", "UKRAINE", "UKR"],
      ["states", "KYIV", "UKR"],
      ["statePolicies", "ua-policy", "UKR"],
      ["corporateSectors", "ua-facility", "UKR"],
      ["macroMetrics", "UKRAINE", "UKR"],
      ["stateRegistrationPool", "RU_KYIV", "UKR"],
    ]);
  });

  it("archives departed energy plants and infrastructure projects keyed by regionId", async () => {
    const mem = createInMemoryDb();
    mem.seed("states", [
      { _id: "RUSSIA", countryId: "RU" },
      { _id: "KYIV", countryId: "RU" },
    ]);
    mem.seed("energyPlants", [
      { _id: "ru-plant", regionId: "RUSSIA", countryId: "RU" },
      { _id: "ua-plant", regionId: "KYIV", countryId: "RU" },
    ]);
    mem.seed("infraProjects", [
      { _id: "ru-project", regionId: "RUSSIA", countryId: "RU" },
      { _id: "ua-project", regionId: "KYIV", countryId: "RU" },
    ]);
    const db = mem as unknown as Db;
    const result = await materializeFederationTerritory({
      db,
      session: {} as ClientSession,
      applicationId: "1991-default:ussr-split:1",
      sourceCountryId: "RU",
      transfers: [
        {
          stateId: "RUSSIA",
          parentRegionId: null,
          topLevelRegionId: "RUSSIA",
          successorEntityId: "RU",
          leavesDetailedSource: false,
        },
        {
          stateId: "KYIV",
          parentRegionId: null,
          topLevelRegionId: "KYIV",
          successorEntityId: "UKR",
          leavesDetailedSource: true,
        },
      ],
    });
    expect(result).toEqual({ statesArchived: 1, regionalRowsArchived: 2 });
    expect((await db.collection("energyPlants").find({}).toArray()).map((row) => row._id)).toEqual([
      "ru-plant",
    ]);
    expect((await db.collection("infraProjects").find({}).toArray()).map((row) => row._id)).toEqual(
      ["ru-project"]
    );
    expect(
      (await db.collection("federationArchivedRegionRows").find({}).toArray()).map((row) => [
        row.collection,
        row.originalId,
        row.successorEntityId,
      ])
    ).toEqual([
      ["states", "KYIV", "UKR"],
      ["energyPlants", "ua-plant", "UKR"],
      ["infraProjects", "ua-project", "UKR"],
    ]);
  });
});
