import { spinOff } from "@/lib/corporations/subsidiaries/commands/spinOff";
import type { Corporation } from "@/lib/db/types";
import { handleRelocateWithCorp } from "@/lib/character/relocateWithCorp";
import { privatizeAsset } from "@/lib/nationalization/privatizeAsset";
import { plantSizeForSector } from "@/lib/constants/facilityQuantum";
import { POST as forceDividend } from "@/app/api/admin/corporations/[id]/dividend/route";
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import {
  startIsolatedMongod,
  stopIsolatedMongod,
  REAL_MONGO_ENABLED,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import { attemptPlantSectorSplit } from "./commands/plantSectorSplitAttempt";
import { reverseNationalizationTaking } from "@/lib/nationalization/reverseNationalization";
import { POST as healShares } from "@/app/api/admin/heal/corporation-shares/route";
import { POST as initializeElections } from "@/app/api/admin/elections/sync-date/route";
let ownedDb: Db | undefined;
vi.mock("@/lib/mechanicalLaws/guards", () => ({
  assertSubsidiaryWithinCap: async () => undefined,
}));
const mover = vi.hoisted(() => ({
  user: "000000000000000000000201",
  character: "000000000000000000000202",
}));
vi.mock("@/lib/api/requireAuth", () => ({
  requireAuthWithCharacter: async () => ({
    ok: true,
    user: {
      userId: mover.user,
      activeCharacterId: mover.character,
      character: {
        _id: new ObjectId(mover.character),
        countryId: "US",
        homeState: "CA",
        party: "independent",
      },
    },
  }),
}));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/corporations/relocationCommandEconomyGate", () => ({
  commandEconomyRelocationBlock: async () => null,
}));
vi.mock("@/lib/time/gameTime", () => ({
  getGameTime: async () => ({
    currentTurn: 1000,
    effectiveNow: new Date(100000),
    lastTurnProcessed: new Date(0),
  }),
  invalidateGameTimeCache: vi.fn(),
}));
vi.mock("@/lib/analytics/officeTransitionAnalytics", () => ({ captureOfficeTransition: vi.fn() }));
vi.mock("@/lib/analytics/serverPosthog", () => ({ flushServerPosthog: vi.fn() }));
vi.mock("@/lib/economy/queries/privateEnterpriseGate", () => ({
  assertPrivateEnterprisePermitted: async () => undefined,
  isPrivateEnterpriseBlocked: async () => false,
}));
vi.mock("@/lib/corporations/marketShare", () => ({ fetchSectorMarketSharePercent: async () => 0 }));

vi.mock("@/lib/mongodb", () => ({
  getDb: async () => {
    if (!ownedDb) throw new Error("Owned fixture missing");
    return ownedDb;
  },
}));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: async () => ({ ok: true }) }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(),
  createNotifications: vi.fn(),
}));
vi.mock("@/lib/wireEvent", () => ({
  logWireEvent: vi.fn(),
  wireHeadlineCorpPrivatized: () => "Privatized",
}));
vi.mock("@/lib/countryAccess", () => ({
  getCountryAccessFromDb: async (_db: Db, country: string) => ({
    status: country === "US" ? "beta" : "coming-soon",
  }),
}));
vi.mock("@/lib/nationalization/treasuryLedger", () => ({
  loadTreasuryCashContext: async () => null,
}));
vi.mock("@/lib/currency/corporationCapital", async (original) => ({
  ...(await original<typeof import("@/lib/currency/corporationCapital")>()),
  getCorpFxRate: async () => 1,
}));
vi.mock("@/lib/nationalization/treasury", () => ({
  creditTreasuryProceedsPaired: async (
    db: Db,
    input: { countryId: string; amountLocal: number }
  ) => {
    await db
      .collection("federalBudget")
      .updateOne({ countryId: input.countryId }, { $inc: { cash: input.amountLocal } });
    return input.amountLocal;
  },
  creditTreasuryProceedsFromAnchor: async (db: Db, countryId: string, amount: number) => {
    await db.collection("federalBudget").updateOne({ countryId }, { $inc: { cash: amount } });
    return amount;
  },
}));
function intercept(
  db: Db,
  collectionName: string,
  operation: string,
  before: () => Promise<void>,
  after = false
): Db {
  return new Proxy(db, {
    get(target, key) {
      if (key === "collection")
        return (name: string) => {
          const collection = target.collection(name);
          if (name !== collectionName) return collection;
          return new Proxy(collection, {
            get(c, method) {
              const value = Reflect.get(c, method);
              if (method === operation)
                return async (...args: unknown[]) => {
                  if (!after) await before();
                  const result = await Reflect.apply(value, c, args);
                  if (after) await before();
                  return result;
                };
              return typeof value === "function" ? value.bind(c) : value;
            },
          });
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe.skipIf(!REAL_MONGO_ENABLED)("ownership recovery on owned Mongo", () => {
  let mongo: IsolatedMongod, db: Db;
  beforeAll(async () => {
    mongo = await startIsolatedMongod("ahd-ownership-recovery-", {
      replicaSet: "ownershipRecovery",
    });
    await mongo.client.db("admin").command({
      replSetInitiate: {
        _id: "ownershipRecovery",
        members: [{ _id: 0, host: new URL(mongo.uri).host }],
      },
    });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if ((await mongo.client.db("admin").command({ hello: 1 })).isWritablePrimary) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect((await mongo.client.db("admin").command({ hello: 1 })).isWritablePrimary).toBe(true);
    db = mongo.db;
  }, 60000);
  beforeEach(async () => {
    await db.dropDatabase();
    ownedDb = db;
    await db.collection("gameState").insertOne({
      _id: "current" as never,
      currentTurn: 1,
      currentYear: 2027,
      startingYear: 2027,
      preset: "2027-default",
      worldEpochId: "owned-world",
      isActive: false,
    });
  });
  afterAll(async () => {
    ownedDb = undefined;
    if (mongo) await stopIsolatedMongod(mongo);
  }, 30000);

  it("native share-heal rollback and simultaneous retries retain cash and custody", async () => {
    const id = new ObjectId(),
      holder = new ObjectId();
    await db.collection("corporations").insertOne({
      _id: id,
      name: "Issuer",
      totalShares: 999,
      publicFloat: 10,
      shareholders: [{ characterId: holder, shares: 90 }],
      liquidCapital: 1234,
    });
    ownedDb = intercept(
      db,
      "corporations",
      "bulkWrite",
      async () => {
        throw new Error("landed repair failure");
      },
      true
    );
    expect((await healShares()).ok).toBe(false);
    expect((await db.collection("corporations").findOne({ _id: id }))?.totalShares).toBe(999);
    ownedDb = db;
    const results = await Promise.all([healShares(), healShares()]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(await db.collection("corporations").findOne({ _id: id })).toMatchObject({
      totalShares: 100,
      liquidCapital: 1234,
      shareholders: [{ characterId: holder, shares: 90 }],
    });
  });

  it("native overlapping plant attacks pay once, preserve stock and commit the cooldown", async () => {
    const attacker = new ObjectId(),
      defender = new ObjectId(),
      site = new ObjectId();
    await db.collection("corporations").insertMany([
      {
        _id: attacker,
        name: "Buyer",
        liquidCapital: 1e9,
        liquidCurrencyCode: "CAD",
        marketingStrength: 100,
      },
      { _id: defender, name: "Seller", liquidCapital: 200, marketingStrength: 0 },
    ]);
    await db.collection("corporateSectors").insertOne({
      _id: site,
      corporationId: defender,
      countryId: "CA",
      stateId: "ON",
      sectorType: "agriculture",
      plantCount: 10,
      capitalStock: 1000,
      capacityBookAnchor: 1e6,
    });
    const args = {
      attacker: { _id: attacker },
      defender: { _id: defender },
      targetSector: { sectorType: "agriculture" as const },
      targetSectorId: site,
      stateId: "ON",
      countryId: "CA" as const,
      currentTurn: 25,
      attackerFxRate: 1.4,
      attackerCurrencyCode: "CAD" as const,
      randomRoll: 0,
      autonomous: true,
    };
    const broken = intercept(
      db,
      "corporateSectors",
      "insertOne",
      async () => {
        throw new Error("landed site failure");
      },
      true
    );
    await expect(attemptPlantSectorSplit(broken, args)).rejects.toThrow("landed site failure");
    expect((await db.collection("corporations").findOne({ _id: attacker }))?.liquidCapital).toBe(
      1e9
    );
    expect((await db.collection("corporateSectors").findOne({ _id: site }))?.plantCount).toBe(10);
    const results = await Promise.all([
      attemptPlantSectorSplit(db, args),
      attemptPlantSectorSplit(db, args),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const success = results.find((result) => result.ok);
    expect(
      success?.ok && (await db.collection("corporations").findOne({ _id: attacker }))?.liquidCapital
    ).toBe(success?.ok ? 1e9 - success.resolution.attackCostLocal : 0);
    const sites = await db.collection("corporateSectors").find({}).toArray();
    expect(sites.reduce((sum, row) => sum + row.plantCount, 0)).toBe(10);
    expect(sites.reduce((sum, row) => sum + row.capacityBookAnchor, 0)).toBe(1e6);
  });

  it("native merged-taking reversal rolls back the lost-destination window and recovers cash once", async () => {
    const state = new ObjectId(),
      prior = new ObjectId(),
      site = new ObjectId();
    await db.collection("corporations").insertMany([
      { _id: state, name: "State", countryOwnerId: "US", countryId: "US", liquidCapital: 0 },
      { _id: prior, name: "Prior", countryId: "US", liquidCapital: 1000 },
    ]);
    await db.collection("federalBudget").insertOne({ countryId: "US", cash: 20 });
    await db.collection("corporateSectors").insertOne({
      _id: site,
      corporationId: state,
      stateId: "TX",
      sectorType: "extraction",
      revenue: 1000,
      workers: 100,
      currentGrowthCost: 50,
      nationalizationProvenance: {
        formerCorporationId: prior,
        formerRevenue: 1000,
        takenAtTurn: 10,
        compensationAnchor: 600,
        compensationCountryId: "US",
        mergedIntoExisting: true,
        foldedRevenue: 850,
        foldedWorkers: 10,
        foldedGrowthCost: 5,
      },
    });
    const params = { countryId: "US", sectorIds: [site], turn: 25, label: "Order" };
    const broken = intercept(
      db,
      "corporateSectors",
      "insertOne",
      async () => {
        throw new Error("landed destination failure");
      },
      true
    );
    expect(await reverseNationalizationTaking(broken, params)).toMatchObject({
      restoredToPriorOwner: 0,
      skipped: 1,
    });
    expect((await db.collection("corporateSectors").findOne({ _id: site }))?.revenue).toBe(1000);
    const results = await Promise.all([
      reverseNationalizationTaking(db, params),
      reverseNationalizationTaking(db, params),
    ]);
    expect(results.reduce((sum, result) => sum + result.restoredToPriorOwner, 0)).toBe(1);
    expect((await db.collection("corporations").findOne({ _id: prior }))?.liquidCapital).toBe(400);
    expect((await db.collection("federalBudget").findOne({ countryId: "US" }))?.cash).toBe(620);
    expect(await db.collection("corporateSectors").countDocuments({ corporationId: prior })).toBe(
      1
    );
  });

  it("refuses election initialization in an established world without touching funded campaigns", async () => {
    await db
      .collection("gameState")
      .updateOne({ _id: "current" as never }, { $set: { currentTurn: 25 } });
    await db.collection("campaigns").insertOne({ funds: 500, electionId: new ObjectId() });
    expect((await initializeElections()).status).toBe(409);
    expect(
      (await db.collection("gameState").findOne({ _id: "current" as never }))?.currentTurn
    ).toBe(25);
    expect((await db.collection("campaigns").findOne({}))?.funds).toBe(500);
  });

  it("native election initialization rolls back its clock and replacements after a landed insert", async () => {
    const old = new ObjectId();
    await db
      .collection("elections")
      .insertOne({ _id: old, countryId: "US", electionType: "president", cycle: 1 });
    ownedDb = intercept(
      db,
      "elections",
      "insertMany",
      async () => {
        throw new Error("landed election failure");
      },
      true
    );
    expect((await initializeElections()).ok).toBe(false);
    expect(await db.collection("elections").countDocuments({ _id: old })).toBe(1);
    expect(
      (await db.collection("gameState").findOne({ _id: "current" as never }))?.lastTurnProcessed
    ).toBeUndefined();
    ownedDb = db;
    const results = await Promise.all([initializeElections(), initializeElections()]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(await db.collection("elections").countDocuments({ _id: old })).toBe(0);
    expect(await db.collection("elections").countDocuments({ electionType: "president" })).toBe(1);
  });
  it("native forced dividends conserve all owner buckets and pay a repeated request once", async () => {
    const issuer = new ObjectId(),
      holder = new ObjectId(),
      human = new ObjectId(),
      npc = new ObjectId(),
      fund = new ObjectId();
    await db.collection("exchangeRates").insertMany([
      { currencyCode: "CAD", rate: 1.4 },
      { currencyCode: "EUR", rate: 0.8 },
      { currencyCode: "USD", rate: 1 },
    ]);
    await db.collection("corporations").insertMany([
      {
        _id: issuer,
        name: "Issuer",
        countryId: "CA",
        liquidCurrencyCode: "CAD",
        liquidCapital: 140,
        dividendRate: 10,
        totalShares: 100,
        publicFloat: 20,
        shareholders: [
          { characterId: human, shares: 20 },
          { nppId: npc, shares: 20 },
          { corporationId: holder, shares: 20 },
          { fundId: fund, shares: 20 },
        ],
      },
      { _id: holder, name: "Holder", countryId: "DE", liquidCurrencyCode: "EUR", liquidCapital: 0 },
    ]);
    await db.collection("characters").insertOne({
      _id: human,
      name: "Human",
      countryId: "CA",
      currencyBalances: { personal: { CAD: 0 } },
    });
    await db
      .collection("npps")
      .insertOne({ _id: npc, countryId: "CA", currencyBalances: { personal: { CAD: 0 } } });
    await db.collection("indexFunds").insertOne({
      _id: fund,
      name: "Empty fund",
      slug: "empty",
      unitSupply: 0,
      cashAnchor: 0,
      anchorCurrencyCode: "USD",
    });
    const invoke = () =>
      forceDividend(
        new Request("https://example.com/dividend", {
          method: "POST",
          headers: { "Idempotency-Key": "native-dividend" },
        }),
        { params: Promise.resolve({ id: issuer.toHexString() }) }
      );
    ownedDb = intercept(
      db,
      "financialTxLog",
      "insertMany",
      async () => {
        throw new Error("landed dividend ledger failure");
      },
      true
    );
    expect((await invoke()).ok).toBe(false);
    expect((await db.collection("corporations").findOne({ _id: issuer }))?.liquidCapital).toBe(140);
    expect((await db.collection("indexFunds").findOne({ _id: fund }))?.cashAnchor).toBe(0);
    ownedDb = db;
    const replies = await Promise.all([invoke(), invoke()]);
    for (const reply of replies)
      expect(await reply.json()).toMatchObject({ success: true, paid: 14, recipients: 5 });
    const payer = await db.collection("corporations").findOne({ _id: issuer }),
      target = await db.collection("corporations").findOne({ _id: holder });
    const person = await db.collection("characters").findOne({ _id: human }),
      npp = await db.collection("npps").findOne({ _id: npc });
    const index = await db.collection("indexFunds").findOne({ _id: fund }),
      pool = await db.collection("equityMarketPools").findOne({ _id: "CAD" as never });
    const total =
      (payer!.liquidCapital +
        person!.currencyBalances.personal.CAD +
        npp!.currencyBalances.personal.CAD +
        pool!.cashLocal) /
        1.4 +
      target!.liquidCapital / 0.8 +
      index!.cashAnchor;
    expect(total).toBeCloseTo(100, 8);
    expect(payer!.liquidCapital).toBe(126);
  });
  it("native combined relocation commits cash and both residences together under retries", async () => {
    const corp = new ObjectId(),
      site = new ObjectId(),
      characterId = new ObjectId(mover.character);
    await db
      .collection("gameState")
      .updateOne({ _id: "current" as never }, { $set: { currentTurn: 1000 } });
    await db.collection("states").insertMany([
      { _id: "CA" as never, countryId: "US", name: "California" },
      { _id: "TX" as never, countryId: "US", name: "Texas" },
    ]);
    await db.collection("exchangeRates").insertOne({ currencyCode: "USD", rate: 1 });
    await db.collection("characters").insertOne({
      _id: characterId,
      userId: new ObjectId(mover.user),
      countryId: "US",
      homeState: "CA",
      party: "independent",
      lastRelocatedAt: null,
    });
    await db.collection("corporations").insertOne({
      _id: corp,
      name: "Mover",
      ceoId: characterId,
      ceoType: "character",
      userId: new ObjectId(mover.user),
      countryId: "US",
      headquartersState: "CA",
      liquidCapital: 1000,
      liquidCurrencyCode: "USD",
      sharePrice: 10,
      totalShares: 100,
    });
    await db.collection("corporateSectors").insertOne({
      _id: site,
      corporationId: corp,
      countryId: "US",
      stateId: "CA",
      sectorType: "agriculture",
      capitalStock: 100,
      capacityBookAnchor: 1000,
    });
    const invoke = () =>
      handleRelocateWithCorp(
        new Request("https://example.com/relocate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetStateId: "TX", paymentMethod: "cash" }),
        })
      );
    ownedDb = intercept(
      db,
      "characters",
      "updateOne",
      async () => {
        throw new Error("landed character move failure");
      },
      true
    );
    expect((await invoke()).ok).toBe(false);
    expect(await db.collection("corporations").findOne({ _id: corp })).toMatchObject({
      liquidCapital: 1000,
      headquartersState: "CA",
    });
    expect((await db.collection("characters").findOne({ _id: characterId }))?.homeState).toBe("CA");
    ownedDb = db;
    const results = await Promise.all([invoke(), invoke()]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await db.collection("corporations").findOne({ _id: corp })).toMatchObject({
      liquidCapital: 930,
      headquartersState: "TX",
    });
    expect((await db.collection("characters").findOne({ _id: characterId }))?.homeState).toBe("TX");
  });

  it("native privatization atomically replaces the legacy site and auction shell", async () => {
    const owner = new ObjectId(),
      site = new ObjectId();
    await db.collection("exchangeRates").insertOne({ currencyCode: "USD", rate: 1 });
    await db.collection("corporations").insertOne({
      _id: owner,
      name: "State",
      countryId: "US",
      countryOwnerId: "US",
      isPrimaryNationalCorporation: true,
      ownershipState: "stateOwned",
      liquidCapital: 10000,
      liquidCurrencyCode: "USD",
    });
    await db.collection("corporateSectors").insertOne({
      _id: site,
      corporationId: owner,
      countryId: "US",
      stateId: "TX",
      sectorType: "agriculture",
      revenue: 10000,
      workers: 10,
      currentGrowthCost: 100,
      profitMargin: 20,
      capitalStock: plantSizeForSector({ sectorType: "agriculture" }) * 10,
      plantCount: 10,
      capacityBookAnchor: 1e6,
    });
    const params = {
      countryId: "US" as const,
      sourceNationalCorporationId: owner,
      selections: [{ sectorId: site, carveFraction: 0.2 }],
      newCorpName: "Carved Farm",
      goldenSharePercent: 0.1,
      method: "auction" as const,
      turn: 100,
    };
    const broken = intercept(
      db,
      "nationalizationAuctions",
      "insertOne",
      async () => {
        throw new Error("landed auction failure");
      },
      true
    );
    await expect(privatizeAsset(broken, params)).rejects.toThrow("landed auction failure");
    expect(await db.collection("corporations").countDocuments({})).toBe(1);
    expect(await db.collection("corporateSectors").countDocuments({})).toBe(1);
    expect((await db.collection("corporateSectors").findOne({ _id: site }))?.plantCount).toBe(10);
    const result = await privatizeAsset(db, params);
    expect(
      await db
        .collection("nationalizationAuctions")
        .countDocuments({ corporationId: result.newCorporationId })
    ).toBe(1);
    const sites = await db.collection("corporateSectors").find({}).toArray();
    expect(sites.reduce((sum, row) => sum + row.plantCount, 0)).toBe(10);
    expect(sites.reduce((sum, row) => sum + row.capacityBookAnchor, 0)).toBe(1e6);
  });

  it("native spin-off rolls back the credited fee with construction and then commits once", async () => {
    const parentId = new ObjectId(),
      user = new ObjectId(),
      ceo = new ObjectId(),
      appointed = new ObjectId(),
      site = new ObjectId();
    const parent = {
      _id: parentId,
      name: "Parent",
      countryId: "US",
      headquartersState: "TX",
      userId: user,
      ceoId: ceo,
      ceoType: "character",
      liquidCapital: 1e8,
      liquidCurrencyCode: "USD",
      totalShares: 100,
      publicFloat: 0,
      shareholders: [],
    } as unknown as Corporation;
    await db.collection("corporations").insertOne(parent);
    await db.collection("characters").insertMany([
      { _id: ceo, userId: user },
      { _id: appointed, userId: new ObjectId() },
    ]);
    await db.collection("federalBudget").insertOne({ countryId: "US", cash: 100 });
    await db.collection("exchangeRates").insertOne({ currencyCode: "USD", rate: 1 });
    const queue = [
      { id: "paid-build", costPaidAnchor: 2000, targetCapacity: 50, completesAtTurn: 1005 },
    ];
    await db.collection("corporateSectors").insertOne({
      _id: site,
      corporationId: parentId,
      countryId: "US",
      stateId: "TX",
      sectorType: "technology",
      revenue: 10000,
      currentGrowthCost: 100,
      capitalStock: 500,
      capacityBookAnchor: 10000,
      inventoryUnits: { technology: 25 },
      buildQueue: queue,
    });
    const input = {
      parent,
      callerUserId: user,
      callerCharacterId: ceo.toHexString(),
      sectorType: "technology" as const,
      name: "Subsidiary",
      tickerSymbol: "SUB",
      appointedCeoType: "character" as const,
      appointedCeoCharacterId: appointed,
      turn: 1000,
      now: new Date(0),
    };
    const broken = intercept(
      db,
      "federalBudget",
      "updateOne",
      async () => {
        throw new Error("landed fee failure");
      },
      true
    );
    await expect(spinOff(broken, input)).rejects.toThrow("landed fee failure");
    expect(await db.collection("corporations").countDocuments({})).toBe(1);
    expect(
      (await db.collection("corporateSectors").findOne({ _id: site }))?.corporationId.equals(
        parentId
      )
    ).toBe(true);
    expect((await db.collection("federalBudget").findOne({}))?.cash).toBe(100);
    const results = await Promise.all([spinOff(db, input), spinOff(db, input)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const updated = await db.collection("corporateSectors").findOne({ _id: site });
    expect(updated).toMatchObject({
      capitalStock: 500,
      capacityBookAnchor: 10000,
      inventoryUnits: { technology: 25 },
      buildQueue: queue,
    });
    expect(updated!.corporationId.equals(parentId)).toBe(false);
    expect(
      (await db.collection("corporations").findOne({ _id: parentId }))!.liquidCapital +
        (await db.collection("federalBudget").findOne({}))!.cash
    ).toBe(1e8 + 100);
  });
});
