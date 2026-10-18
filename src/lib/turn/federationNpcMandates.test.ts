import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { csRegions1991 } from "@/lib/countries/cs/data/csRegions1991";
import { yuRegions1991 } from "@/lib/countries/yu/data/yuRegions1991";
import { sovietUnionRegions1991 } from "@/lib/countries/ru/data/sovietUnionRegions1991";
import {
  getLowerChamberOfficeType,
  getUpperChamberOfficeType,
} from "@/lib/legislature/chamberOfficeType";
import { defaultNpcCustodians } from "@/lib/world/succession/defaultProposal";
import { processFederationNpcMandates } from "./federationNpcMandates";

/** A formed NPC government whose premier sits in `party`. */
function seedNpcGovernment(
  mem: ReturnType<typeof createInMemoryDb>,
  countryId: string,
  party = "1"
): ObjectId {
  const pmNppId = new ObjectId();
  mem.seed("npps", [{ _id: pmNppId, countryId, party }]);
  mem.seed("governmentFormations", [
    { _id: countryId, status: "formed", pmCharacterId: null, pmNppId },
  ]);
  return pmNppId;
}

describe("autonomous federation mandates", () => {
  it("opens one ordinary CS bill after the date and leaves the outcome to voting", async () => {
    const mem = createInMemoryDb();
    mem.seed("gameState", [
      { _id: "current", preset: "1991-default", currentYear: 1992, currentTurn: 96 },
    ]);
    mem.seed("states", csRegions1991 as unknown as Record<string, unknown>[]);
    mem.seed("electedOfficials", [
      {
        _id: new ObjectId(),
        countryId: "CS",
        officeType: getLowerChamberOfficeType("CS", "1991-default"),
        nppId: new ObjectId(),
        characterId: null,
      },
    ]);
    seedNpcGovernment(mem, "CS", "4");
    const db = mem as unknown as Db;
    expect(await processFederationNpcMandates(db, "1991-default", 1992, new Date(0))).toBe(1);
    expect(await processFederationNpcMandates(db, "1991-default", 1992, new Date(0))).toBe(0);
    const bill = await mem.collection("bills").findOne({ countryId: "CS" });
    expect(bill).toMatchObject({
      status: "active",
      sponsorParty: "4",
      federationSettlementMandate: { sourceEntityId: "CS" },
    });
    expect(await mem.collection("federationRatifications").countDocuments({})).toBe(0);
    expect(await mem.collection("federationSettlementApplications").countDocuments({})).toBe(0);
  });

  it("waits for the date and preserves a player-held federal choice", async () => {
    const mem = createInMemoryDb();
    mem.seed("gameState", [
      { _id: "current", preset: "1991-default", currentYear: 1992, currentTurn: 96 },
    ]);
    mem.seed("states", csRegions1991 as unknown as Record<string, unknown>[]);
    mem.seed("electedOfficials", [
      {
        _id: new ObjectId(),
        countryId: "CS",
        officeType: getLowerChamberOfficeType("CS", "1991-default"),
        nppId: new ObjectId(),
        characterId: new ObjectId(),
      },
    ]);
    const db = mem as unknown as Db;
    expect(await processFederationNpcMandates(db, "1991-default", 1991, new Date(0))).toBe(0);
    expect(await processFederationNpcMandates(db, "1991-default", 1992, new Date(0))).toBe(0);
    expect(await mem.collection("bills").countDocuments({})).toBe(0);
  });

  it("waits for an NPP government if a formation record is pending", async () => {
    const mem = createInMemoryDb();
    const nppId = new ObjectId();
    mem.seed("gameState", [
      { _id: "current", preset: "1991-default", currentYear: 1992, currentTurn: 96 },
    ]);
    mem.seed("states", csRegions1991 as unknown as Record<string, unknown>[]);
    mem.seed("electedOfficials", [
      {
        _id: new ObjectId(),
        countryId: "CS",
        officeType: getLowerChamberOfficeType("CS", "1991-default"),
        nppId,
        characterId: null,
      },
    ]);
    mem.seed("governmentFormations", [
      { _id: "CS", status: "pending", pmCharacterId: null, pmNppId: null },
    ]);
    const db = mem as unknown as Db;
    expect(await processFederationNpcMandates(db, "1991-default", 1992, new Date(0))).toBe(0);
    mem.seed("npps", [{ _id: nppId, countryId: "CS", party: "1" }]);
    await mem
      .collection("governmentFormations")
      .updateOne({ _id: "CS" }, { $set: { status: "formed", pmNppId: nppId } });
    expect(await processFederationNpcMandates(db, "1991-default", 1992, new Date(0))).toBe(1);
  });

  it("does not bypass a player in Yugoslavia's appointed upper chamber", async () => {
    const mem = createInMemoryDb();
    mem.seed("gameState", [
      { _id: "current", preset: "1991-default", currentYear: 1991, currentTurn: 1 },
    ]);
    mem.seed("states", yuRegions1991 as unknown as Record<string, unknown>[]);
    mem.seed("electedOfficials", [
      {
        _id: new ObjectId(),
        countryId: "YU",
        officeType: getLowerChamberOfficeType("YU", "1991-default"),
        nppId: new ObjectId(),
        characterId: null,
      },
      {
        _id: new ObjectId(),
        countryId: "YU",
        officeType: getUpperChamberOfficeType("YU", "1991-default"),
        nppId: null,
        characterId: new ObjectId(),
      },
    ]);
    expect(
      await processFederationNpcMandates(mem as unknown as Db, "1991-default", 1991, new Date(0))
    ).toBe(0);
  });

  it("opens the Soviet mandate under an NPP Congress and government", async () => {
    const mem = createInMemoryDb();
    mem.seed("gameState", [
      { _id: "current", preset: "1991-default", currentYear: 1996, currentTurn: 294 },
    ]);
    mem.seed("states", sovietUnionRegions1991 as unknown as Record<string, unknown>[]);
    mem.seed("electedOfficials", [
      {
        _id: new ObjectId(),
        countryId: "RU",
        officeType: getLowerChamberOfficeType("RU", "1991-default"),
        nppId: new ObjectId(),
        characterId: null,
      },
    ]);
    seedNpcGovernment(mem, "RU", "1");
    const db = mem as unknown as Db;
    expect(await processFederationNpcMandates(db, "1991-default", 1996, new Date(0))).toBe(1);
    expect(await processFederationNpcMandates(db, "1991-default", 1996, new Date(0))).toBe(0);
    const bill = await mem.collection("bills").findOne({ countryId: "RU" });
    expect(bill).toMatchObject({
      status: "active",
      sponsorParty: "1",
      federationSettlementMandate: { sourceEntityId: "RU", revision: 1 },
    });
    expect(await mem.collection("federationSettlementApplications").countDocuments({})).toBe(0);
  });

  it("leaves the Soviet decision to a player seated in Congress", async () => {
    const mem = createInMemoryDb();
    mem.seed("gameState", [
      { _id: "current", preset: "1991-default", currentYear: 1996, currentTurn: 294 },
    ]);
    mem.seed("states", sovietUnionRegions1991 as unknown as Record<string, unknown>[]);
    mem.seed("electedOfficials", [
      {
        _id: new ObjectId(),
        countryId: "RU",
        officeType: getLowerChamberOfficeType("RU", "1991-default"),
        nppId: null,
        characterId: new ObjectId(),
      },
    ]);
    expect(
      await processFederationNpcMandates(mem as unknown as Db, "1991-default", 1996, new Date(0))
    ).toBe(0);
    expect(await mem.collection("bills").countDocuments({})).toBe(0);
  });

  it("reopens a mandate that failed without a single vote cast", async () => {
    const mem = createInMemoryDb();
    const billId = new ObjectId();
    mem.seed("gameState", [
      { _id: "current", preset: "1991-default", currentYear: 1996, currentTurn: 294 },
    ]);
    mem.seed("states", csRegions1991 as unknown as Record<string, unknown>[]);
    mem.seed("electedOfficials", [
      {
        _id: new ObjectId(),
        countryId: "CS",
        officeType: getLowerChamberOfficeType("CS", "1991-default"),
        nppId: new ObjectId(),
        characterId: null,
      },
    ]);
    seedNpcGovernment(mem, "CS", "4");
    mem.seed("federationPoliticalProposals", [
      {
        _id: "1991-default:cs-1991-default:1",
        presetId: "1991-default",
        sourceEntityId: "CS",
        settlementId: "cs-1991-default",
        revision: 1,
        status: "rejected",
        billId,
      },
    ]);
    mem.seed("bills", [
      { _id: billId, countryId: "CS", status: "failed", votesFor: 0, votesAgainst: 0 },
    ]);
    const db = mem as unknown as Db;
    expect(await processFederationNpcMandates(db, "1991-default", 1996, new Date(0))).toBe(1);
    expect(
      await mem
        .collection("bills")
        .findOne({ countryId: "CS", "federationSettlementMandate.revision": 2 })
    ).toMatchObject({ status: "active", sponsorParty: "4" });
    expect(await processFederationNpcMandates(db, "1991-default", 1996, new Date(0))).toBe(0);
  });

  it("accepts a mandate that was actually voted down", async () => {
    const mem = createInMemoryDb();
    const billId = new ObjectId();
    mem.seed("gameState", [
      { _id: "current", preset: "1991-default", currentYear: 1996, currentTurn: 294 },
    ]);
    mem.seed("states", csRegions1991 as unknown as Record<string, unknown>[]);
    mem.seed("electedOfficials", [
      {
        _id: new ObjectId(),
        countryId: "CS",
        officeType: getLowerChamberOfficeType("CS", "1991-default"),
        nppId: new ObjectId(),
        characterId: null,
      },
    ]);
    seedNpcGovernment(mem, "CS", "4");
    mem.seed("federationPoliticalProposals", [
      {
        _id: "1991-default:cs-1991-default:1",
        presetId: "1991-default",
        sourceEntityId: "CS",
        settlementId: "cs-1991-default",
        revision: 1,
        status: "rejected",
        billId,
      },
    ]);
    mem.seed("bills", [
      { _id: billId, countryId: "CS", status: "failed", votesFor: 40, votesAgainst: 110 },
    ]);
    expect(
      await processFederationNpcMandates(mem as unknown as Db, "1991-default", 1996, new Date(0))
    ).toBe(0);
  });

  it("needs a formed government to sponsor the mandate", async () => {
    const mem = createInMemoryDb();
    mem.seed("gameState", [
      { _id: "current", preset: "1991-default", currentYear: 1992, currentTurn: 96 },
    ]);
    mem.seed("states", csRegions1991 as unknown as Record<string, unknown>[]);
    mem.seed("electedOfficials", [
      {
        _id: new ObjectId(),
        countryId: "CS",
        officeType: getLowerChamberOfficeType("CS", "1991-default"),
        nppId: new ObjectId(),
        characterId: null,
      },
    ]);
    expect(
      await processFederationNpcMandates(mem as unknown as Db, "1991-default", 1992, new Date(0))
    ).toBe(0);
  });

  it("publishes explicit shared-asset custody in the NPC opening position", () => {
    expect(
      defaultNpcCustodians(
        [
          { entityId: "SK", population: 5, regionIds: ["S"], annualGdpAnchor: 1 },
          { entityId: "CZ2", population: 10, regionIds: ["C"], annualGdpAnchor: 2 },
        ],
        [
          { assetId: "strategic", kind: "strategic-force", homeRegionId: "S" },
          { assetId: "unlocated", kind: "public-enterprise", homeRegionId: null },
          { assetId: "local", kind: "conventional-force", homeRegionId: "S" },
        ]
      )
    ).toEqual({ strategic: "CZ2", unlocated: "CZ2" });
  });
});

describe("autonomous federation mandates at the year rollover", () => {
  it("judges eligibility on the stored world year and never fails the phase", async () => {
    const mem = createInMemoryDb();
    mem.seed("gameState", [
      { _id: "current", preset: "1991-default", currentYear: 1991, currentTurn: 48 },
    ]);
    mem.seed("states", csRegions1991 as unknown as Record<string, unknown>[]);
    mem.seed("electedOfficials", [
      {
        _id: new ObjectId(),
        countryId: "CS",
        officeType: getLowerChamberOfficeType("CS", "1991-default"),
        nppId: new ObjectId(),
        characterId: null,
      },
    ]);
    const db = mem as unknown as Db;
    // The turn hands over the new year before the stored year has rolled.
    await expect(processFederationNpcMandates(db, "1991-default", 1992, new Date(0))).resolves.toBe(
      0
    );
  });
});
