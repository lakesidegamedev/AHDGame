import * as mongoConnection from "@/lib/mongodb";
import { ensureSecededChamberElections } from "@/lib/turn/perpetualElections/shared";
import { resetCorpFxRateCacheForTests } from "@/lib/currency/corporationCapital";
import { processReferendumLifecycle } from "./processReferendumLifecycle";
import { processIndependenceDesireDrift } from "@/lib/turn/independenceDesireDrift";
import { loadIndependenceDesireSnapshots } from "@/lib/governorOffice/devolution/queries";
import { refundConversionConstruction } from "./refundConversionConstruction";
import { secedeRegion } from "./secede/secedeRegion";
import { transferRegion } from "./transfer/transferRegion";
import { REQUEST_AP_COST } from "@/lib/constants/referendum";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import {
  REAL_MONGO_ENABLED,
  assertOwnedMongod,
  startIsolatedMongod,
  stopIsolatedMongod,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import {
  prepareManagedMongo,
  initializeLocalReplicaSet,
} from "@/lib/singleplayer/prepareManagedMongo";
import { afterCommit, withSessionDb } from "@/lib/db/sessionDb";
import { requestReferendum } from "./requestReferendum";
import { spendGroundGame } from "./groundGame";
import { applyReferendumOutcome } from "./outcome";
import type { Referendum } from "@/lib/db/types/referendum";
import { seedOpeningDepartmentBoards1991 } from "@/lib/resetFinance/seedOpeningDepartments1991";
import {
  buildOpeningMetricSnapshots1991,
  seedOpeningMetrics1991,
} from "@/lib/resetMetrics/seedOpening1991";
import { buildOpeningLawBoards1991 } from "@/lib/resetLegislation/openingBoards1991";
import { seedOpeningLawBoards1991 } from "@/lib/resetLegislation/seedOpening1991";
import type { ResetDepartmentAccountSnapshot } from "@/lib/resetFinance/rules/liveDepartmentAccount";
import type { ResetNationalTreasurySnapshot } from "@/lib/resetFinance/rules/treasurySnapshot";
vi.mock("@/lib/governorOffice/devolution/queries", () => ({
  loadIndependenceDesireSnapshots: vi.fn(),
}));
vi.mock("./referendumWebhooks", () => ({
  announceReferendumRequested: vi.fn().mockResolvedValue(undefined),
  announceReferendumVoteResult: vi.fn().mockResolvedValue(undefined),
  announceConsentBillResolved: vi.fn().mockResolvedValue(undefined),
  announceReunificationComplete: vi.fn().mockResolvedValue(undefined),
  announceSecessionComplete: vi.fn().mockResolvedValue(undefined),
}));

describe.runIf(REAL_MONGO_ENABLED)("atomic referendum lifecycle against owned MongoDB", () => {
  let fixture: IsolatedMongod | null = null;
  let db: Db;
  beforeAll(async () => {
    fixture = await startIsolatedMongod("ahd-referendum-", { replicaSet: "ahd-local" });
    await assertOwnedMongod(fixture.proc, fixture.client);
    await initializeLocalReplicaSet(fixture.client.db("admin").admin(), new URL(fixture.uri).host);
    db = fixture.db;
  }, 60_000);
  beforeEach(async () => {
    resetCorpFxRateCacheForTests();
    await assertOwnedMongod(fixture!.proc, fixture!.client);
    await db.dropDatabase();
    await db
      .collection<{ _id: string; currentTurn: number }>("gameState")
      .insertOne({ _id: "current", currentTurn: 100 });
  });
  afterAll(async () => {
    await stopIsolatedMongod(fixture);
  }, 30_000);
  it("reopens the initialized managed database without changing its data", async () => {
    vi.stubEnv("SINGLEPLAYER", "1");
    try {
      await prepareManagedMongo(fixture!.uri);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(
      (
        await db
          .collection<{ _id: string; currentTurn: number }>("gameState")
          .findOne({ _id: "current" })
      )?.currentTurn
    ).toBe(100);
  });
  it("rolls back cross-collection writes and discards notifications on interruption", async () => {
    const effect = vi.fn(async () => {});
    await expect(
      withSessionDb(db, async (tx) => {
        await tx.collection("syntheticAccounts").insertOne({ balance: 100 });
        await tx.collection("syntheticLedger").insertOne({ amount: 100 });
        await afterCommit(tx, effect);
        throw new Error("interruption");
      })
    ).rejects.toThrow("interruption");
    expect(await db.collection("syntheticAccounts").countDocuments()).toBe(0);
    expect(await db.collection("syntheticLedger").countDocuments()).toBe(0);
    expect(effect).not.toHaveBeenCalled();
  });
  it("serializes racing referendum requests and charges only the winner", async () => {
    await db
      .collection("governorOfficeState")
      .insertOne({ countryId: "UK", stateId: "SCO", gubernatorialActions: 5 });
    await db
      .collection<{ _id: string; independenceDesire: { value: number } }>("macroMetrics")
      .insertOne({ _id: "SCO", independenceDesire: { value: 70 } });
    const results = await Promise.all([
      requestReferendum(db, { countryId: "UK", stateId: "SCO" }),
      requestReferendum(db, { countryId: "UK", stateId: "SCO" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await db.collection("referendums").countDocuments()).toBe(1);
    expect(
      (await db.collection("governorOfficeState").findOne({ stateId: "SCO" }))?.gubernatorialActions
    ).toBe(5 - REQUEST_AP_COST);
  });
  it("preserves NIR constitutional cooldown after a newer peace ballot", async () => {
    await db
      .collection("governorOfficeState")
      .insertOne({ countryId: "UK", stateId: "NIR", gubernatorialActions: 5 });
    await db
      .collection<{ _id: string; independenceDesire: { value: number } }>("macroMetrics")
      .insertOne({ _id: "NIR", independenceDesire: { value: 70 } });
    await db.collection("referendums").insertMany([
      {
        countryId: "UK",
        regionId: "NIR",
        kind: "reunification",
        status: "completed",
        cooldownReadyAtTurn: 580,
        updatedAt: new Date(0),
      },
      {
        countryId: "UK",
        regionId: "NIR",
        kind: "peace_agreement",
        status: "completed",
        updatedAt: new Date(),
      },
    ]);
    expect((await requestReferendum(db, { countryId: "UK", stateId: "NIR" })).status).toBe(400);
    expect(
      (await db.collection("governorOfficeState").findOne({ stateId: "NIR" }))?.gubernatorialActions
    ).toBe(5);
    expect(await db.collection("referendums").countDocuments()).toBe(2);
  });
  it("retains both paid ground-game effects under concurrent spending", async () => {
    const refId = new ObjectId();
    const characterId = new ObjectId();
    await db.collection("referendums").insertOne({
      _id: refId,
      countryId: "UK",
      regionId: "SCO",
      kind: "independence",
      status: "campaigning",
      campaignCloseTurn: 150,
      campaignBaseYesShare: 60,
      yesShare: 60,
      cohortBaseline: [{ groupId: "all", share: 1, turnout: 60, yesLean: 60 }],
    });
    await db
      .collection("characters")
      .insertOne({ _id: characterId, actions: 10, currencyBalances: { campaign: 1000000 } });
    const input = {
      referendumId: String(refId),
      characterId,
      countryId: "UK" as const,
      side: "yes" as const,
      presetId: "press_conference",
      target: "whole" as const,
      mode: "volunteer" as const,
    };
    expect(
      (await Promise.all([spendGroundGame(db, input), spendGroundGame(db, input)])).map(
        (r) => r.status
      )
    ).toEqual([200, 200]);
    const ref = await db.collection("referendums").findOne({ _id: refId });
    expect(ref?.groundGameUnits[0].persuadeYes).toBe(1);
    expect((await db.collection("characters").findOne({ _id: characterId }))?.actions).toBe(8);
  });
  it("rolls back a paid action when its effect write fails", async () => {
    const refId = new ObjectId();
    const characterId = new ObjectId();
    await db.collection("referendums").insertOne({
      _id: refId,
      countryId: "UK",
      regionId: "SCO",
      status: "campaigning",
      campaignCloseTurn: 150,
      campaignBaseYesShare: 60,
      yesShare: 60,
      cohortBaseline: [{ groupId: "all", share: 1, turnout: 60, yesLean: 60 }],
    });
    await db
      .collection("characters")
      .insertOne({ _id: characterId, actions: 10, currencyBalances: { campaign: 1000000 } });
    const faultDb = new Proxy(db, {
      get(target, key) {
        if (key === "collection")
          return (name: string) => {
            const collection = target.collection(name);
            return name === "referendums"
              ? new Proxy(collection, {
                  get(col, method) {
                    if (method === "updateOne")
                      return async () => {
                        throw new Error("effect write failed");
                      };
                    const value = Reflect.get(col, method);
                    return typeof value === "function" ? value.bind(col) : value;
                  },
                })
              : collection;
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      spendGroundGame(faultDb, {
        referendumId: String(refId),
        characterId,
        countryId: "UK",
        side: "yes",
        presetId: "press_conference",
        target: "whole",
        mode: "volunteer",
      })
    ).rejects.toThrow("effect write failed");
    expect((await db.collection("characters").findOne({ _id: characterId }))?.actions).toBe(10);
    expect(
      (await db.collection("referendums").findOne({ _id: refId }))?.cohortModifiers
    ).toBeUndefined();
  });
  it("refunds a whole partly delivered order atomically and removes its delivered capacity", async () => {
    const owner = new ObjectId(),
      sector = new ObjectId();
    await db.collection("corporations").insertOne({
      _id: owner,
      name: "Synthetic builder",
      headquartersState: "SCO",
      countryId: "UK",
      liquidCurrencyCode: "GBP",
      liquidCapital: 500,
    });
    await db.collection("exchangeRates").insertOne({ currencyCode: "GBP", rate: 2 });
    await db.collection("corporateSectors").insertOne({
      _id: sector,
      corporationId: owner,
      stateId: "SCO",
      countryId: "UK",
      sectorType: "manufacturing",
      capitalStock: 240,
      capacityBookAnchor: 2400,
      operatingCapacityTurn: 14,
      buildQueue: [
        { unitsOrdered: 100, costPaidAnchor: 1000, smooth: true, startTurn: 10, onlineTurn: 20 },
      ],
    });
    await expect(
      withSessionDb(db, async (tx) => {
        await refundConversionConstruction(tx, "SCO", 15);
        throw new Error("synthetic interruption");
      })
    ).rejects.toThrow("synthetic interruption");
    expect(await db.collection("corporations").findOne({ _id: owner })).toMatchObject({
      liquidCapital: 500,
    });
    expect(await db.collection("corporateSectors").findOne({ _id: sector })).toMatchObject({
      capitalStock: 240,
      buildQueue: [{ unitsOrdered: 100 }],
    });
    await withSessionDb(db, (tx) => refundConversionConstruction(tx, "SCO", 15));
    await withSessionDb(db, (tx) => refundConversionConstruction(tx, "SCO", 16));
    expect(await db.collection("corporations").findOne({ _id: owner })).toMatchObject({
      liquidCapital: 2500,
    });
    expect(await db.collection("corporateSectors").findOne({ _id: sector })).toMatchObject({
      capitalStock: 200,
      capacityBookAnchor: 2000,
      constructionInProgressAnchor: 0,
      buildQueue: [],
    });
    expect(
      await db.collection("unownedSectors").findOne({ stateId: "SCO", sectorType: "manufacturing" })
    ).toMatchObject({ headroomUnits: 100 });
  });
  it("rolls back Scotland's map and budget when later government migration fails", async () => {
    await db
      .collection<{ _id: string; countryId: string; gdp: number; population: number }>("states")
      .insertMany([
        { _id: "SCO", countryId: "UK", gdp: 100, population: 5000000 },
        { _id: "LON", countryId: "UK", gdp: 900, population: 9000000 },
      ]);
    await db.collection<{ _id: string; [key: string]: unknown }>("federalBudget").insertOne({
      _id: "UK",
      countryId: "UK",
      gdp: 1000,
      treasuryBalance: 1000,
      taxBases: { income: 1000 },
      debt: { principal: 0, interestRate: 3 },
    });
    const faultDb = new Proxy(db, {
      get(target, key) {
        if (key === "collection")
          return (name: string) => {
            const collection = target.collection(name);
            return name === "electedOfficials"
              ? new Proxy(collection, {
                  get(col, method) {
                    if (method === "find")
                      return () => {
                        throw new Error("government migration interrupted");
                      };
                    const value = Reflect.get(col, method);
                    return typeof value === "function" ? value.bind(col) : value;
                  },
                })
              : collection;
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      secedeRegion(faultDb, { regionId: "SCO", fromCountryId: "UK", currentTurn: 100 })
    ).rejects.toThrow("government migration interrupted");
    expect(await db.collection("states").countDocuments({ countryId: "SCO" })).toBe(0);
    expect(await db.collection<{ _id: string }>("states").findOne({ _id: "SCO" })).not.toBeNull();
    expect(
      await db.collection<{ _id: string }>("federalBudget").findOne({ _id: "SCO" })
    ).toBeNull();
    expect(
      (
        await db
          .collection<{ _id: string; treasuryBalance: number }>("federalBudget")
          .findOne({ _id: "UK" })
      )?.treasuryBalance
    ).toBe(1000);
  });
  it.each(["SCO", "WAL"])(
    "commits %s independence, caretaker and all snap elections exactly once",
    async (countryId) => {
      const leader = new ObjectId(),
        other = new ObjectId();
      await db.collection<{ _id: string; [key: string]: unknown }>("states").insertMany([
        { _id: countryId, countryId: "UK", gdp: 100, population: 5000000, capitalStock: 250 },
        { _id: "LON", countryId: "UK", gdp: 900, population: 9000000, houseDistricts: 500 },
      ]);
      await db.collection<{ _id: string; [key: string]: unknown }>("federalBudget").insertOne({
        _id: "UK",
        countryId: "UK",
        gdp: 1000,
        treasuryBalance: 1000,
        taxBases: { income: 1000 },
        debt: { principal: 0, interestRate: 3 },
      });
      await db.collection("characters").insertMany([
        {
          _id: leader,
          countryId: "UK",
          homeState: countryId,
          party: "independent",
          currentOffice: { type: "governor" },
        },
        {
          _id: other,
          countryId: "UK",
          homeState: countryId,
          party: "independent",
          currentOffice: { type: "commons" },
        },
      ]);
      await db.collection("electedOfficials").insertMany([
        {
          countryId: "UK",
          state: countryId,
          officeType: "governor",
          characterId: leader,
          characterName: "Synthetic FM",
          party: "independent",
        },
        {
          countryId: "UK",
          state: countryId,
          officeType: "commons",
          characterId: other,
          seatsHeld: 10,
        },
      ]);
      const staleRace = new ObjectId();
      await db.collection("elections").insertOne({
        _id: staleRace,
        countryId: "UK",
        state: countryId,
        electionType: "commons",
        status: "completed",
      });
      await db
        .collection("electionCandidates")
        .insertOne({ electionId: staleRace, characterId: other });
      const result = await secedeRegion(db, {
        regionId: countryId,
        fromCountryId: "UK",
        currentTurn: 100,
      });
      expect(result.ok).toBe(true);
      expect(await db.collection("elections").findOne({ _id: staleRace })).toBeNull();
      expect(
        await db.collection("electionCandidates").countDocuments({ electionId: staleRace })
      ).toBe(0);
      const regions = await db.collection("states").find({ countryId }).toArray();
      expect(regions.reduce((sum, row) => sum + row.gdp, 0)).toBeCloseTo(100);
      expect(regions.reduce((sum, row) => sum + row.population, 0)).toBe(5000000);
      expect(await db.collection("elections").countDocuments({ countryId, status: "active" })).toBe(
        regions.length * 3
      );
      expect(
        await db.collection("electedOfficials").findOne({ characterId: leader })
      ).toMatchObject({ countryId, officeType: "firstMinister" });
      expect(await db.collection("electedOfficials").countDocuments({ characterId: other })).toBe(
        0
      );
      expect(await db.collection("characters").findOne({ _id: other })).toMatchObject({
        countryId,
        currentOffice: null,
      });
      expect(await db.collection("organizationMemberships").findOne({ countryId })).toMatchObject({
        organizationId: "UN",
        status: "active",
      });
      expect(
        await secedeRegion(db, { regionId: countryId, fromCountryId: "UK", currentTurn: 101 })
      ).toMatchObject({ skipped: "already-seceded" });
      expect(await db.collection("elections").countDocuments({ countryId })).toBe(
        regions.length * 3
      );
      expect(
        await db
          .collection<{ _id: string; treasuryBalance: number }>("federalBudget")
          .findOne({ _id: countryId })
      ).toMatchObject({ treasuryBalance: 100 });
      // Replay the real scheduler against the converted database, including retries.
      const connection = vi.spyOn(mongoConnection, "getDb").mockResolvedValue(db);
      try {
        const type = countryId === "SCO" ? "holyrood" : "senedd";
        const now = new Date();
        await ensureSecededChamberElections(countryId as "SCO" | "WAL", type, now, undefined, 101);
        await ensureSecededChamberElections(countryId as "SCO" | "WAL", type, now, undefined, 101);
        expect(await db.collection("elections").countDocuments({ countryId })).toBe(
          regions.length * 3
        );
        await db.collection("elections").updateMany(
          { countryId, electionType: `snap_${type}` },
          {
            $set: {
              status: "resolved",
              resolvedAtTurn: 148,
              endTurn: 148,
              updatedAt: new Date(0),
            },
          }
        );
        await ensureSecededChamberElections(countryId as "SCO" | "WAL", type, now, undefined, 149);
        await ensureSecededChamberElections(countryId as "SCO" | "WAL", type, now, undefined, 149);
        const regulars = await db
          .collection("elections")
          .find({ countryId, electionType: type })
          .toArray();
        expect(regulars).toHaveLength(regions.length);
        expect(regulars.reduce((sum, race) => sum + race.totalSeats, 0)).toBe(
          countryId === "SCO" ? 129 : 60
        );
        expect(regulars.every((race) => race.endTurn > 149)).toBe(true);
      } finally {
        connection.mockRestore();
      }
    }
  );
  it("automatically retries all three enacted referendums with separately settled UK departments", async () => {
    const worldId = "referendum-finance-retry";
    const game = db.collection<{ _id: string }>("gameState");
    await game.updateOne(
      { _id: "current" },
      { $set: { resetWorldId: worldId, manuallyEnabledSeats: ["secretary_of_education"] } }
    );
    const cabinet = await seedOpeningDepartmentBoards1991(db, worldId, 100, ["UK"]);
    const accounts = db.collection<ResetDepartmentAccountSnapshot>("resetDepartmentAccounts");
    const treasuries = db.collection<ResetNationalTreasurySnapshot>("resetNationalTreasuries");
    const separatelySettled = { countryId: "UK" as const, externallySettled: true };
    const ordinary = { countryId: "UK" as const, externallySettled: false };
    expect(await accounts.countDocuments(separatelySettled)).toBeGreaterThan(0);
    expect(await accounts.countDocuments(ordinary)).toBeGreaterThan(0);
    const regions = ["WAL", "SCO", "NIR"] as const;
    const states = db.collection<{
      _id: string;
      countryId: string;
      gdp: number;
      population: number;
    }>("states");
    const openingRegions = buildOpeningMetricSnapshots1991(worldId, 100)
      .filter((row) => (row.countryId === "UK" || row.countryId === "IE") && row.regionId)
      .map((row) => ({
        _id: row.regionId!,
        countryId: row.countryId,
        gdp: 100,
        population: 1000000,
      }));
    await states.insertMany(openingRegions);
    await db.collection("stateBudgets").insertMany(
      buildOpeningLawBoards1991(worldId, 100)
        .filter((row) => row.countryId === "UK" && row.ukTerritorialTax)
        .map((row) => ({
          countryId: "UK",
          stateId: row.regionId,
          revenue: {
            propertyTax: row.ukTerritorialTax!.sourceOwnRevenueProxy,
            domesticCorporateTax: 0,
            foreignCorporateTax: 0,
          },
        }))
    );
    const metrics = await seedOpeningMetrics1991(db, worldId, 100, ["UK"]);
    const legislation = await seedOpeningLawBoards1991(db, worldId, 100, ["UK"]);
    await game.updateOne(
      { _id: "current" },
      {
        $set: {
          metricsSystemVersion: "v2",
          legislationSystemVersion: "v2",
          cabinetSystemVersion: "v2",
          resetVersionSeeds: { metrics, legislation, cabinet },
        },
      }
    );
    await db.collection<{ _id: string; [key: string]: unknown }>("federalBudget").insertMany(
      ["UK", "IE"].map((countryId) => ({
        _id: countryId,
        countryId,
        treasuryBalance: 1000,
        taxBases: { income: 1000 },
        revenue: { total: 1000 },
        spending: { total: 1000, debtInterest: 0, stateGrants: 0 },
        debt: { principal: 0, interestRate: 3 },
      }))
    );
    await db.collection("exchangeRates").insertMany([
      { currencyCode: "GBP", rate: 2 },
      { currencyCode: "IEP", rate: 3 },
    ]);
    const bills = regions.map(() => ({ _id: new ObjectId(), status: "signed" }));
    await db.collection("bills").insertMany(bills);
    const refs = db.collection("referendums");
    await refs.insertMany(
      regions.map((regionId, index) => ({
        _id: new ObjectId(),
        countryId: "UK",
        regionId,
        kind: regionId === "NIR" ? "reunification" : "independence",
        targetCountryId: regionId === "NIR" ? "IE" : null,
        status: "actuating",
        westminsterBillId: bills[index]._id,
        dailBillId: null,
      }))
    );
    const connection = vi.spyOn(mongoConnection, "getDb").mockResolvedValue(db);
    try {
      await treasuries.updateOne({ _id: "UK" }, { $set: { settledThroughTurn: 101 } });
      await expect(processReferendumLifecycle(db, 101)).rejects.toThrow(
        "Source department and treasury turns disagree"
      );
      expect(await states.countDocuments({ countryId: "UK" })).toBe(
        openingRegions.filter((row) => row.countryId === "UK").length
      );
      expect(
        await refs.countDocuments({ status: "actuating", conversionRevision: { $exists: false } })
      ).toBe(3);
      expect(await treasuries.countDocuments({ _id: { $in: ["SCO", "WAL"] } })).toBe(0);

      await game.updateOne({ _id: "current" }, { $set: { currentTurn: 102 } });
      await treasuries.updateOne({ _id: "UK" }, { $set: { settledThroughTurn: 102 } });
      await accounts.updateMany(ordinary, { $set: { accruedThroughTurn: 102 } });
      expect(await processReferendumLifecycle(db, 102)).toMatchObject({ processed: 3 });
      expect(await refs.countDocuments({ status: "completed", conversionRevision: 1 })).toBe(3);
      expect(await states.countDocuments({ countryId: "SCO" })).toBeGreaterThan(0);
      expect(await states.countDocuments({ countryId: "WAL" })).toBeGreaterThan(0);
      expect(await states.findOne({ _id: "NIR" })).toMatchObject({ countryId: "IE" });
      expect(
        await treasuries.countDocuments({
          _id: { $in: ["SCO", "WAL"] },
          settledThroughTurn: 102,
        })
      ).toBe(2);
      expect(await accounts.countDocuments({ ...separatelySettled, accruedThroughTurn: 102 })).toBe(
        0
      );
      expect(await processReferendumLifecycle(db, 102)).toBeNull();
    } finally {
      connection.mockRestore();
    }
  }, 30_000);

  it("commits reunification with rescaled Dail mandates and one frozen public FX conversion", async () => {
    const mp = new ObjectId();
    await db.collection("exchangeRates").insertMany([
      { currencyCode: "GBP", rate: 2 },
      { currencyCode: "IEP", rate: 3 },
    ]);
    await db.collection<{ _id: string; [key: string]: unknown }>("states").insertMany([
      {
        _id: "NIR",
        countryId: "UK",
        gdp: 100,
        capitalStock: 200,
        population: 1500000,
        houseDistricts: 18,
        stateSenateSeats: 90,
      },
      { _id: "LON", countryId: "UK", gdp: 900, population: 9000000, houseDistricts: 500 },
      {
        _id: "DUB",
        countryId: "IE",
        gdp: 200,
        population: 3000000,
        houseDistricts: 160,
        stateSenateSeats: 60,
      },
    ]);
    await db.collection<{ _id: string; [key: string]: unknown }>("federalBudget").insertMany([
      { _id: "UK", countryId: "UK", taxBases: { income: 1000 }, baselineStateGrants: 100 },
      { _id: "IE", countryId: "IE", taxBases: { income: 200 }, baselineStateGrants: 20 },
    ]);
    await db.collection("characters").insertOne({
      _id: mp,
      countryId: "UK",
      homeState: "NIR",
      party: "independent",
      currentOffice: { type: "commons", seatsHeld: 18 },
    });
    await db.collection("electedOfficials").insertOne({
      countryId: "UK",
      state: "NIR",
      officeType: "commons",
      characterId: mp,
      party: "independent",
      seatsHeld: 18,
    });
    const args = {
      regionId: "NIR",
      fromCountryId: "UK" as const,
      toCountryId: "IE" as const,
      province: "Ulster",
      relocateToRegionId: "LON",
      currentTurn: 100,
      deferCountryWidePasses: true,
    };
    expect(await transferRegion(db, args)).toMatchObject({ ok: true });
    expect(
      await db.collection<{ _id: string; [key: string]: unknown }>("states").findOne({ _id: "NIR" })
    ).toMatchObject({ countryId: "IE", gdp: 150, capitalStock: 300, houseDistricts: 80 });
    expect(await db.collection("electedOfficials").findOne({ characterId: mp })).toMatchObject({
      countryId: "IE",
      state: "NIR",
      officeType: "dail",
      seatsHeld: 80,
    });
    expect(await db.collection("characters").findOne({ _id: mp })).toMatchObject({
      countryId: "IE",
      homeState: "NIR",
      currentOffice: { type: "dail", seatsHeld: 80 },
    });
    expect(await transferRegion(db, args)).toMatchObject({ skipped: "already-transferred" });
    expect(
      await db.collection<{ _id: string; gdp: number }>("states").findOne({ _id: "NIR" })
    ).toMatchObject({ gdp: 150 });
  });
  it("rolls back Northern Ireland's map and budget if currency conversion cannot finish", async () => {
    await db
      .collection<{ _id: string; countryId: string; gdp: number; population: number }>("states")
      .insertMany([
        { _id: "NIR", countryId: "UK", gdp: 100, population: 1500000 },
        { _id: "LON", countryId: "UK", gdp: 900, population: 9000000 },
      ]);
    await db.collection<{ _id: string; [key: string]: unknown }>("federalBudget").insertMany([
      { _id: "UK", taxBases: { income: 1000 }, baselineStateGrants: 100 },
      { _id: "IE", taxBases: { income: 200 }, baselineStateGrants: 20 },
    ]);
    await expect(
      transferRegion(db, {
        regionId: "NIR",
        fromCountryId: "UK",
        toCountryId: "IE",
        province: "Ulster",
        relocateToRegionId: "LON",
        currentTurn: 100,
      })
    ).rejects.toThrow("exchange rates");
    expect(
      (await db.collection<{ _id: string; countryId: string }>("states").findOne({ _id: "NIR" }))
        ?.countryId
    ).toBe("UK");
    expect(
      (
        await db
          .collection<{ _id: string; baselineStateGrants: number }>("federalBudget")
          .findOne({ _id: "UK" })
      )?.baselineStateGrants
    ).toBe(100);
  });
  it("does not let a stale drift erase a newer referendum Desire change", async () => {
    await db
      .collection<{ _id: string; independenceDesire: { value: number } }>("macroMetrics")
      .insertOne({ _id: "SCO", independenceDesire: { value: 75 } });
    vi.mocked(loadIndependenceDesireSnapshots).mockResolvedValueOnce([
      { stateId: "SCO", previous: 70, next: 70.05, delta: 0.05 } as Awaited<
        ReturnType<typeof loadIndependenceDesireSnapshots>
      >[number],
    ]);
    expect((await processIndependenceDesireDrift(db, 100))?.regionsProcessed).toBe(0);
    expect(
      (
        await db
          .collection<{ _id: string; independenceDesire: { value: number } }>("macroMetrics")
          .findOne({ _id: "SCO" })
      )?.independenceDesire.value
    ).toBe(75);
  });
  it("rolls back every campaign snapshot when one update in the batch fails", async () => {
    await db.createCollection("referendums", {
      validator: { $nor: [{ regionId: "WAL", status: "campaigning" }] },
    });
    await db.collection("referendums").insertMany(
      ["SCO", "WAL", "NIR"].map((regionId) => ({
        countryId: "UK",
        regionId,
        kind: regionId === "NIR" ? "reunification" : "independence",
        status: "granted",
        yesShare: 65,
        campaignBaseYesShare: 65,
        campaignOpenTurn: 95,
        campaignCloseTurn: 143,
        updatedAt: new Date(0),
      }))
    );
    await expect(processReferendumLifecycle(db, 100)).rejects.toThrow();
    expect(await db.collection("referendums").countDocuments({ status: "granted" })).toBe(3);
    expect(await db.collection("referendumWire").countDocuments({ kind: "opened" })).toBe(0);
  });
  it("commits each campaign opening once when lifecycle workers race", async () => {
    const refs = ["SCO", "WAL", "NIR"].map((regionId) => ({
      _id: new ObjectId(),
      countryId: "UK",
      regionId,
      kind: regionId === "NIR" ? "reunification" : "independence",
      status: "granted",
      yesShare: 65,
      campaignBaseYesShare: 65,
      campaignOpenTurn: 95,
      campaignCloseTurn: 143,
      updatedAt: new Date(0),
    }));
    await db.collection("referendums").insertMany(refs);
    const results = await Promise.all([
      processReferendumLifecycle(db, 100),
      processReferendumLifecycle(db, 100),
    ]);
    expect(results.reduce((sum, result) => sum + (result?.processed ?? 0), 0)).toBe(3);
    expect(await db.collection("referendums").countDocuments({ status: "campaigning" })).toBe(3);
    expect(await db.collection("referendumWire").countDocuments({ kind: "opened" })).toBe(3);
  });
  it("creates one consent bill when counting is retried concurrently", async () => {
    const ref = {
      _id: new ObjectId(),
      countryId: "UK",
      regionId: "SCO",
      kind: "independence",
      status: "polling",
      result: null,
      yesShare: 65,
    } as Referendum;
    await db.collection("referendums").insertOne(ref);
    const result = { passed: true, finalYesShare: 65, turnout: 60 };
    await Promise.all([
      applyReferendumOutcome(db, ref, result, 100),
      applyReferendumOutcome(db, ref, result, 100),
    ]);
    expect(await db.collection("bills").countDocuments()).toBe(1);
    expect((await db.collection("referendums").findOne({ _id: ref._id }))?.status).toBe(
      "actuating"
    );
  });
});
