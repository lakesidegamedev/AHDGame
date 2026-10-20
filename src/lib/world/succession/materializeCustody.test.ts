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

  it("keeps retained forces with no station or an off-map station", async () => {
    const groundId = new ObjectId("000000000000000000000064");
    const navalId = new ObjectId("000000000000000000000065");
    const rocketId = new ObjectId("000000000000000000000066");
    const mem = createInMemoryDb();
    mem.seed("militaryUnits", [
      { _id: groundId, countryId: "RU", domain: "ground", station: null },
      { _id: navalId, countryId: "RU", domain: "naval", station: "mea" },
      { _id: rocketId, countryId: "RU", domain: "rocket" },
    ]);
    const db = mem as unknown as Db;
    const retained = (id: ObjectId, kind: "conventional-force" | "strategic-force") => ({
      assetId: `force:${id.toString()}`,
      kind,
      custodianEntityId: "RU",
      disposition: "retain-detailed" as const,
    });
    expect(
      await materializeFederationCustody({
        db,
        session: {} as ClientSession,
        applicationId,
        sourceCountryId: "RU",
        assignments: [
          retained(groundId, "conventional-force"),
          retained(navalId, "conventional-force"),
          retained(rocketId, "strategic-force"),
        ],
        transfers,
      })
    ).toBe(3);
    expect(await db.collection("militaryUnits").countDocuments({})).toBe(3);
    for (const id of [groundId, navalId, rocketId])
      expect(
        await db
          .collection<{ _id: string }>("federationCustodyRecords")
          .countDocuments({ _id: `${applicationId}:force:${id.toString()}` })
      ).toBe(1);
  });

  it("keeps a retained force stationed in territory that stays with the source", async () => {
    const mem = createInMemoryDb();
    mem.seed("militaryUnits", [
      { _id: unitId, countryId: "RU", domain: "ground", station: "RUSSIA" },
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
            custodianEntityId: "RU",
            disposition: "retain-detailed",
          },
        ],
        transfers,
      })
    ).toBe(1);
    expect(await db.collection("militaryUnits").countDocuments({})).toBe(1);
    expect(await db.collection("federationCustodyRecords").countDocuments({})).toBe(1);
  });
});
