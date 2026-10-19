import { ObjectId, type ClientSession, type Db } from "mongodb";
import { describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { materializeFederationCustody } from "./materializeCustody";

const applicationId = "1991-default:ussr-split:1";
const unitId = new ObjectId("000000000000000000000061");
const shellId = new ObjectId("000000000000000000000062");
const sectorId = new ObjectId("000000000000000000000063");
const transfers = [
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
];

describe("federation custody materialization", () => {
  it("records a public shell already archived by the corporation materializer", async () => {
    const mem = createInMemoryDb();
    mem.seed("federationArchivedPublicCorporations", [
      {
        _id: `${applicationId}:${shellId.toString()}`,
        applicationId,
        corporationId: shellId.toString(),
        custodians: ["UKR"],
        value: {
          _id: shellId,
          countryId: "RU",
          countryOwnerId: "RU",
          ownershipState: "stateOwned",
          headquartersState: "UKRAINE",
        },
      },
    ]);
    const db = mem as unknown as Db;
    expect(
      await materializeFederationCustody({
        db,
        session: {} as ClientSession,
        applicationId,
        sourceCountryId: "RU",
        assignments: [
          {
            assetId: `enterprise-shell:${shellId.toString()}`,
            kind: "public-enterprise",
            custodianEntityId: "UKR",
            disposition: "aggregate-background",
          },
        ],
        transfers,
      })
    ).toBe(1);
    expect(await db.collection("federationCustodyRecords").countDocuments({})).toBe(1);
  });

  it("retires a local unit and public shell while recognizing archived facilities", async () => {
    const mem = createInMemoryDb();
    mem.seed("militaryUnits", [
      { _id: unitId, countryId: "RU", domain: "ground", station: "UKRAINE" },
    ]);
    mem.seed("corporations", [
      { _id: shellId, countryId: "RU", countryOwnerId: "RU", headquartersState: "UKRAINE" },
    ]);
    mem.seed("federationArchivedRegionRows", [
      {
        _id: `${applicationId}:corporateSectors:${sectorId.toString()}`,
        applicationId,
        collection: "corporateSectors",
        successorEntityId: "UKR",
        originalId: sectorId.toString(),
        value: { _id: sectorId, countryId: "RU", stateId: "UKRAINE" },
      },
    ]);
    const db = mem as unknown as Db;
    expect(
      await materializeFederationCustody({
        db,
        session: {} as ClientSession,
        applicationId,
        sourceCountryId: "RU",
        assignments: [
          {
            assetId: `force:${unitId.toString()}`,
            kind: "conventional-force",
            custodianEntityId: "UKR",
            disposition: "aggregate-background",
          },
          {
            assetId: `enterprise-shell:${shellId.toString()}`,
            kind: "public-enterprise",
            custodianEntityId: "UKR",
            disposition: "aggregate-background",
          },
          {
            assetId: `enterprise:${sectorId.toString()}`,
            kind: "public-enterprise",
            custodianEntityId: "UKR",
            disposition: "aggregate-background",
          },
        ],
        transfers,
      })
    ).toBe(3);
    expect(await db.collection("militaryUnits").countDocuments({})).toBe(0);
    expect(await db.collection("corporations").countDocuments({})).toBe(0);
    expect(await db.collection("federationCustodyRecords").countDocuments({})).toBe(3);
  });

  it("rejects a force retained in a region that left detailed simulation", async () => {
    const mem = createInMemoryDb();
    mem.seed("militaryUnits", [
      { _id: unitId, countryId: "RU", domain: "rocket", station: "UKRAINE" },
    ]);
    await expect(
      materializeFederationCustody({
        db: mem as unknown as Db,
        session: {} as ClientSession,
        applicationId,
        sourceCountryId: "RU",
        assignments: [
          {
            assetId: `force:${unitId.toString()}`,
            kind: "strategic-force",
            custodianEntityId: "RU",
            disposition: "retain-detailed",
          },
        ],
        transfers,
      })
    ).rejects.toThrow("approved playable station");
  });

  async function retain(
    unit: Record<string, unknown>,
    kind: "conventional-force" | "strategic-force"
  ) {
    const mem = createInMemoryDb();
    mem.seed("militaryUnits", [{ _id: unitId, countryId: "RU", ...unit }]);
    const db = mem as unknown as Db;
    const count = await materializeFederationCustody({
      db,
      session: {} as ClientSession,
      applicationId,
      sourceCountryId: "RU",
      assignments: [
        {
          assetId: `force:${unitId.toString()}`,
          kind,
          custodianEntityId: "RU",
          disposition: "retain-detailed",
        },
      ],
      transfers,
    });
    return { db, count };
  }

  it("keeps a retained ground force that has no station", async () => {
    const { db, count } = await retain({ domain: "ground" }, "conventional-force");
    expect(count).toBe(1);
    expect(await db.collection("militaryUnits").countDocuments({})).toBe(1);
    const records = await db.collection("federationCustodyRecords").find({}).toArray();
    expect(records).toHaveLength(1);
    expect(records[0].sourceDocument).toBeUndefined();
  });

  it("keeps a retained naval force stationed in a map region", async () => {
    const { db, count } = await retain({ domain: "naval", station: "eeu" }, "conventional-force");
    expect(count).toBe(1);
    expect(await db.collection("militaryUnits").countDocuments({})).toBe(1);
  });

  it("keeps a retained strategic force stationed in a retained state", async () => {
    const { db, count } = await retain({ domain: "rocket", station: "RUSSIA" }, "strategic-force");
    expect(count).toBe(1);
    expect(await db.collection("militaryUnits").countDocuments({})).toBe(1);
  });
});
