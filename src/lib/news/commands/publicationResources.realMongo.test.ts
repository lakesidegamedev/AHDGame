import { castLeadershipVoteBatch } from "@/lib/turn/npp/leadershipVoting";
import { castLeadershipVoteBallot } from "@/lib/congress/leadershipVoteBallots";
import { ensurePrimaryNationalCorporation } from "@/lib/nationalization/nationalCorporation";
import { nppBuildPartyOrg } from "@/lib/nppAutonomy/v3/party/nppBuildOrg";
import { processCommandEconomyTurn } from "@/lib/turn/commandEconomyTurn";
import { applyPriceMultipliers } from "@/lib/corporations/applyPriceMultipliers";
import { shedSectorsForCorps } from "@/lib/turn/corporation/corporationSectorShed";
import { processCrisisScars } from "@/lib/turn/crisisV2/scarsShell";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CorporationLookups } from "@/lib/turn/corporation/types";
import { clearStoredMarketizationLevels } from "@/lib/constants/commandEconomy";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db, type Document } from "mongodb";
import type { Character } from "@/lib/db/types";
import {
  startIsolatedMongod,
  stopIsolatedMongod,
  REAL_MONGO_ENABLED,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import { processFundGeneration } from "@/lib/turn/fundGeneration";
import { processNppFundGeneration } from "@/lib/turn/nppFundGeneration";
import { processIntelligenceTurn } from "@/lib/turn/intelligenceTurn";
import { debitIntelligenceAppropriation } from "@/lib/db/collections/intelligenceAppropriation";
import { networkUpkeep } from "@/lib/intelligence/cost";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { createNewsPost } from "./newsCommands";
import { withSessionDb } from "@/lib/db/sessionDb";
import { POST as setAllocation } from "@/app/api/country/[code]/region/[id]/party/[partyId]/primary-allocation/route";
let ownedDb: Db | undefined;
const userId = new ObjectId(),
  actorId = new ObjectId();
vi.mock("@/lib/mongodb", () => ({
  getDb: async () => {
    if (!ownedDb) throw new Error("Owned native fixture missing");
    return ownedDb;
  },
}));
vi.mock("@/lib/discordWebhooks", () => ({
  sendNewsEvent: vi.fn(),
  DISCORD_COLORS: { newsPost: 1 },
}));
vi.mock("@/lib/achievements/triggers", () => ({ checkNewsPostAchievements: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/db/patreonBorders", () => ({ fetchBordersByUserIds: async () => new Map() }));
vi.mock("@/lib/siteMetadata", () => ({ getSiteUrl: () => "https://example.com" }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
vi.mock("@/lib/coldwar/tension", () => ({ getColdWarTension: async () => ({ value: 40 }) }));
vi.mock("@/lib/countryAccess", () => ({
  getAllCountryAccess: async () => ({
    US: { enabledForPlayers: true },
    PL: { enabledForPlayers: false },
  }),
}));
vi.mock("@/lib/time/gameTime", () => ({
  getGameTime: async () => ({ currentTurn: 0, effectiveNow: new Date(0) }),
}));
vi.mock("@/lib/api/requireAuth", () => ({
  requireAuthWithCharacter: async () => ({
    ok: true,
    user: {
      userId: String(userId),
      username: "synthetic",
      isAdmin: false,
      character: { _id: actorId, name: "Synthetic chair" },
    },
  }),
}));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
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

describe.skipIf(!REAL_MONGO_ENABLED)("publication resources on owned Mongo", () => {
  let mongo: IsolatedMongod | null = null,
    db: Db;
  beforeAll(async () => {
    mongo = await startIsolatedMongod("ahd-publication-resources-", {
      replicaSet: "publicationResources",
    });
    await mongo.client.db("admin").command({
      replSetInitiate: {
        _id: "publicationResources",
        members: [{ _id: 0, host: new URL(mongo.uri).host }],
      },
    });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if ((await mongo.client.db("admin").command({ hello: 1 })).isWritablePrimary) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect((await mongo.client.db("admin").command({ hello: 1 })).isWritablePrimary).toBe(true);
    ownedDb = db = mongo.db;
  }, 60000);
  afterAll(async () => {
    clearStoredMarketizationLevels();
    await stopIsolatedMongod(mongo);
  }, 30000);
  beforeEach(async () => {
    await db.dropDatabase();
    await db.collection<Document & { _id: string }>("gameState").insertOne({
      _id: "current",
      currentTurn: 100,
      isProcessing: false,
      worldEpochId: "native-publication",
      preset: "2027-default",
    });
    await db
      .collection<Document & { _id: string }>("exchangeRates")
      .insertOne({ _id: "US", currencyCode: "USD", rate: 1, baseRate: 1 });
  });
  it.each([false, true])("native overlapping income publication, npp=%s", async (npp) => {
    await db
      .collection<Document & { _id: string }>("states")
      .insertOne({ _id: "US-CA", countryId: "US", population: 1000000, gdp: 50000 });
    await db.collection("politicalParties").insertOne({
      countryId: "US",
      sequentialId: 1,
      name: "Synthetic party",
      treasury: 0,
      nationalTaxRate: 10,
    });
    await db.collection<Document & { _id: string }>("statePartyOrg").insertOne({
      _id: "US-CA_1",
      stateId: "US-CA",
      countryId: "US",
      partyId: "1",
      treasury: 0,
      stateTaxRate: 10,
    });
    const actors = Array.from({ length: npp ? 150 : 2 }, () => ({
      _id: new ObjectId(),
      name: "Synthetic member",
      userId: new ObjectId(),
      favorability: 50,
      infamy: 0,
      actions: 20,
      policies: { economic: 0, social: 0 },
      createdAt: new Date(0),
      updatedAt: new Date(0),
      countryId: "US",
      homeState: "US-CA",
      party: "1",
      donorBaseLevel: 0,
      currentOffice: null,
      politicalInfluence: 0,
      funds: 100,
      actionPoints: 0,
      retiredAt: null,
    }));
    await db.collection(npp ? "npps" : "characters").insertMany(actors);
    const run = () =>
      npp
        ? processNppFundGeneration(db, 100)
        : processFundGeneration(actors as Character[], new Date(0), undefined, false, 100);
    const replies = await Promise.all([run(), run()]);
    expect(replies[0]).toEqual(replies[1]);
    const paid = await db
      .collection(npp ? "npps" : "characters")
      .find({})
      .toArray();
    const delivered =
      paid.reduce((sum, row) => sum + row.funds - 100, 0) +
      (await db.collection("politicalParties").findOne({}))!.treasury +
      (await db.collection("statePartyOrg").findOne({}))!.treasury;
    expect(delivered).toBeCloseTo(replies[0].totalGenerated);
    expect(
      await db.collection("bankMoneyMoves").countDocuments({ kind: "turn-value-settlement" })
    ).toBe(1);
    await db.collection("politicalParties").updateOne({}, { $set: { nationalTaxRate: 99 } });
    expect(await run()).toEqual(replies[0]);
    expect(
      await db
        .collection(npp ? "npps" : "characters")
        .find({})
        .toArray()
    ).toEqual(paid);
  });
  it("native upkeep overlaps and a concurrent operating debit retain their exact cash changes", async () => {
    await db.collection("federalBudget").insertOne({
      countryId: "US",
      gdp: 1000000,
      spending: { byCategory: { intelligence: TURNS_PER_YEAR * 1000 } },
      intelligenceAppropriation: { balance: 100000, accruedThroughTurn: 99 },
    });
    await db.collection("intelligenceNetworks").insertOne({
      ownerCountryId: "US",
      targetCountryId: "PL",
      level: 1,
      progress: 10,
      funding: "steady",
      suspicion: 40,
      status: "active",
      cooledUntilTurn: null,
      lastOpTurn: 0,
    });
    await db.collection("intelligenceAgencies").createIndex({ countryId: 1 }, { unique: true });
    const [first, second, spent] = await Promise.all([
      processIntelligenceTurn(db, 100),
      processIntelligenceTurn(db, 100),
      debitIntelligenceAppropriation(db, "US", 200),
    ]);
    expect(spent).toBe(true);
    expect(first).toEqual(second);
    expect(
      (await db.collection("federalBudget").findOne({}))!.intelligenceAppropriation.balance
    ).toBe(100000 + Math.round(1000 - networkUpkeep("steady", 1000000)) - 200);
    const network = await db.collection("intelligenceNetworks").findOne({});
    expect(network!.progress).toBeGreaterThan(10);
    await processIntelligenceTurn(db, 100);
    expect((await db.collection("intelligenceNetworks").findOne({}))!.progress).toBe(
      network!.progress
    );
  });
  it.each(["article", "advertisement"] as const)(
    "native concurrent %s publication has one author and one charge",
    async (feedType) => {
      await db.collection("users").insertOne({ _id: userId, activeCharacterId: actorId });
      await db.collection("characters").insertOne({
        _id: actorId,
        userId,
        countryId: "US",
        name: "Synthetic author",
        party: "independent",
        actions: 20,
        currencyBalances: { personal: { USD: 500000 } },
      });
      const run = () =>
        createNewsPost(db, {
          userId: String(userId),
          feedType,
          content: "Synthetic publication content",
        });
      const replies = await Promise.allSettled([run(), run()]);
      expect(replies.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await db.collection("newsPosts").countDocuments({})).toBe(1);
      expect(
        await db.collection("financialTxLog").countDocuments({ type: "sponsored_post_payment" })
      ).toBe(feedType === "article" ? 0 : 1);
      expect((await db.collection("characters").findOne({}))!.currencyBalances.personal.USD).toBe(
        feedType === "article" ? 500000 : 400000
      );
    }
  );
  it("allocation cannot commit after turn admission opens a primary", async () => {
    await db
      .collection<Document & { _id: string }>("states")
      .insertOne({ _id: "TX", countryId: "US", name: "Synthetic region" });
    await db
      .collection("politicalParties")
      .insertOne({ countryId: "US", sequentialId: 1, chairId: actorId, name: "Synthetic party" });
    await db.collection<Document & { _id: string }>("statePartyOrg").insertOne({
      _id: "TX_1",
      countryId: "US",
      stateId: "TX",
      partyId: "1",
      primaryAllocation: "PR",
    });
    const allocation = () =>
      setAllocation(
        new Request("http://localhost/api/synthetic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method: "WTA" }),
        }),
        { params: Promise.resolve({ code: "US", id: "TX", partyId: "1" }) }
      );
    const [response] = await Promise.all([
      allocation(),
      withSessionDb(db, async (db) => {
        await db
          .collection<Document & { _id: string }>("gameState")
          .updateOne(
            { _id: "current" },
            { $set: { isProcessing: true }, $inc: { turnAdmissionFence: 1 } }
          );
        await db.collection("elections").insertOne({
          countryId: "US",
          electionType: "president",
          status: "active",
          primaryEndTurn: 101,
        });
      }),
    ]);
    expect([200, 409]).toContain(response.status);
    expect((await db.collection("statePartyOrg").findOne({}))!.primaryAllocation).toBe(
      response.status === 200 ? "WTA" : "PR"
    );
    expect((await allocation()).status).toBe(409);
  });
  it("native directed-credit interruption preserves paid property and overlapping retries issue once", async () => {
    await db
      .collection<Document & { _id: string }>("gameState")
      .updateOne({ _id: "current" }, { $set: { preset: "1953-default", currentYear: 1953 } });
    await db.collection("gameConfig").insertOne({
      _id: "default",
      commandEconomyEnabled: true,
      marketSystemMode: "plants",
    } as never);
    await db
      .collection("exchangeRates")
      .insertOne({ _id: "RU", currencyCode: "SUR", rate: 1, baseRate: 1 } as never);
    await db.collection("federalBudget").insertOne({
      _id: "RU",
      countryId: "RU",
      economicFactors: {
        gdpGrowth: 4,
        wageGrowth: 10,
        inflationRate: 3,
        tradeGrowth: 2,
        marketizationLevel: 0,
      },
    } as never);
    const corporationId = new ObjectId();
    await db.collection("corporations").insertOne({
      _id: corporationId,
      countryId: "RU",
      liquidCurrencyCode: "SUR",
      liquidCapital: 5000,
      soe: {
        sector: "manufacturing",
        capacity: 1000,
        output: 900,
        planTarget: 1000,
        efficiency: 1,
        cumulativeLosses: 0,
        directorId: null,
      },
    });
    await db.collection("corporateSectors").insertOne({
      _id: new ObjectId(),
      corporationId,
      sectorType: "manufacturing",
      countryId: "RU",
      stateId: "CEN",
      revenue: 1000,
      realizedRevenue: 900,
      capitalStock: 20000,
      capacityBookAnchor: 100000,
      buildQueue: [{ unitsOrdered: 10, startTurn: 9, onlineTurn: 12, costPaidAnchor: 100 }],
      producerInventory: {
        worldEpoch: "synthetic",
        turn: 99,
        inputStock: [{ commodity: "energy", units: 7, value: 70 }],
        outputStock: [],
      },
    });
    const before = await db.collection("corporateSectors").findOne({});
    const fault = intercept(
      db,
      "corporations",
      "bulkWrite",
      async () => {
        throw new Error("synthetic landed credit");
      },
      true
    );
    await expect(processCommandEconomyTurn(fault, 100, 1953)).rejects.toThrow(
      "synthetic landed credit"
    );
    expect(await db.collection("corporateSectors").findOne({})).toEqual(before);
    const replies = await Promise.all([
      processCommandEconomyTurn(db, 100, 1953),
      processCommandEconomyTurn(db, 100, 1953),
    ]);
    expect(replies[0]).toEqual(replies[1]);
    const built = await db.collection("corporateSectors").findOne({});
    expect(built!.capitalStock).toBeGreaterThan(20000);
    expect(built!.buildQueue).toEqual(before!.buildQueue);
    expect(built!.producerInventory).toEqual(before!.producerInventory);
    expect((await db.collection("corporations").findOne({}))!.liquidCapital).toBe(5000);
    expect(
      await db.collection("bankMoneyMoves").countDocuments({ phase: "command-economy-credit" })
    ).toBe(1);
  });
  it("native CEO attrition restores a failed bulk and survives a restart without shedding twice", async () => {
    const corp = {
      _id: new ObjectId(),
      ceoId: null,
      ceoVacant: true,
      liquidCapital: 5000,
    } as unknown as Corporation;
    const sector = {
      _id: new ObjectId(),
      corporationId: corp._id,
      sectorType: "agriculture",
      strategyId: "traditional",
      plantsStartTurn: 1,
      capitalStock: 1000,
      capacityBookAnchor: 10000,
      workers: 100,
      revenue: 3000,
      buildQueue: [{ unitsOrdered: 10, startTurn: 9, onlineTurn: 12 }],
      producerInventory: {
        worldEpoch: "synthetic",
        turn: 99,
        inputStock: [{ commodity: "energy", units: 7, value: 70 }],
        outputStock: [{ commodity: "food", units: 20, book: "US:CA" }],
      },
    } as unknown as CorporateSector;
    await db.collection("corporations").insertOne(corp);
    await db.collection("corporateSectors").insertOne(sector);
    const view = () =>
      ({
        wholePlantsOn: false,
        sectorsByCorp: new Map([[String(corp._id), [{ ...sector }]]]),
      }) as CorporationLookups;
    const fault = intercept(
      db,
      "corporateSectors",
      "bulkWrite",
      async () => {
        throw new Error("synthetic landed shed");
      },
      true
    );
    await expect(
      shedSectorsForCorps(fault, view(), [corp], 0.1, new Date(), "Vacant CEO", true, 100)
    ).rejects.toThrow("synthetic landed shed");
    expect(await db.collection("corporateSectors").findOne({})).toEqual(sector);
    const results = await Promise.all([
      shedSectorsForCorps(db, view(), [corp], 0.1, new Date(), "Vacant CEO", true, 100),
      shedSectorsForCorps(db, view(), [corp], 0.1, new Date(), "Vacant CEO", true, 100),
    ]);
    expect(results[0]).toEqual(results[1]);
    const after = await db.collection("corporateSectors").findOne({});
    expect(after).toMatchObject({
      capitalStock: 900,
      capacityBookAnchor: 9000,
      producerInventory: {
        worldEpoch: "synthetic",
        turn: 99,
        inputStock: [{ commodity: "energy", units: 7, value: 70 }],
        outputStock: [{ commodity: "food", units: 20, book: "US:CA" }],
      },
    });
    expect(after!.buildQueue).toEqual(sector.buildQueue);
  });
  it("native scar healing rolls back a landed effect before its baseline save", async () => {
    await db.collection("states").insertOne({ _id: "TX", countryId: "US" } as never);
    await db
      .collection("federalBudget")
      .insertOne({ _id: "federal", countryId: "US", investorConfidence: 70 } as never);
    await db.collection("crises").insertOne({
      _id: new ObjectId(),
      scarsHealUntil: 120,
      v2: {
        scars: [
          {
            ruleId: "r",
            kind: "creditStanding",
            targetId: "US",
            magnitude: 0.02,
            createdTurn: 100,
            recoveryTurns: 20,
          },
        ],
      },
    });
    const fault = intercept(
      db,
      "federalBudget",
      "updateMany",
      async () => {
        throw new Error("synthetic landed scar");
      },
      true
    );
    await expect(processCrisisScars(fault, 100)).rejects.toThrow("synthetic landed scar");
    expect((await db.collection("federalBudget").findOne({}))!.investorConfidence).toBe(70);
    const results = await Promise.all([processCrisisScars(db, 100), processCrisisScars(db, 100)]);
    expect(results[0]).toEqual(results[1]);
    expect((await db.collection("crises").findOne({}))!.v2.scars[0].applied).toBe(0.02);
  });
  it("native pricing preserves post-snapshot trades and arbitrates identical snapshots", async () => {
    await db.collection("corporations").insertOne({
      _id: new ObjectId(),
      countryId: "US",
      type: "energy",
      fundamentalSharePrice: 100,
      sharePrice: 100,
      publicFloat: 0,
      totalShares: 10000,
      orderFlowMultiplier: 1,
      orderFlowWindowBuyValue: 100,
      orderFlowWindowSellValue: 40,
    });
    let count = 0,
      release = () => {};
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const raced = intercept(db, "corporations", "bulkWrite", async () => {
      if (++count === 2) {
        await db
          .collection("corporations")
          .updateOne({}, { $inc: { orderFlowWindowBuyValue: 50, orderFlowWindowSellValue: 20 } });
        release();
      }
      await ready;
    });
    const replies = await Promise.all([applyPriceMultipliers(raced), applyPriceMultipliers(raced)]);
    expect(replies.reduce((sum, r) => sum + r.updated, 0)).toBe(1);
    expect(await db.collection("corporations").findOne({})).toMatchObject({
      priceMultiplierRevision: 1,
      orderFlowWindowBuyValue: 50,
      orderFlowWindowSellValue: 20,
    });
  });
  it("native missing-primary races create one national issuer", async () => {
    const corps = await Promise.all(
      Array.from({ length: 8 }, () => ensurePrimaryNationalCorporation(db, "CA"))
    );
    expect(new Set(corps.map((c) => String(c._id))).size).toBe(1);
    expect(await db.collection("corporations").countDocuments({ countryOwnerId: "CA" })).toBe(1);
  });
  it("native organization clicks preserve the last PS and pair money with its contribution", async () => {
    await db.collection("politicalParties").insertOne({
      _id: new ObjectId(),
      countryId: "US",
      sequentialId: 1,
      name: "Synthetic party",
      treasury: 10000000,
      politicalStrength: 10,
    });
    await db
      .collection("states")
      .insertOne({ _id: "CA", countryId: "US", population: 1000000, name: "California" } as never);
    await db
      .collection("characters")
      .insertOne({ _id: actorId, countryId: "US", homeState: "CA", party: "1" });
    await db.collection("statePartyOrg").insertOne({
      _id: "CA_1",
      countryId: "US",
      stateId: "CA",
      partyId: "1",
      organization: 20,
      organizationUnits: 20,
      politicalStrength: 1,
      treasury: 10000000,
      hasPresence: true,
    } as never);
    const replies = await Promise.all([
      nppBuildPartyOrg(db, actorId, "US", "CA", 1, 100),
      nppBuildPartyOrg(db, actorId, "US", "CA", 1, 100),
    ]);
    expect(replies.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.collection("partyPoliticalStrengthLedger").countDocuments({})).toBe(1);
    const row = await db.collection("statePartyOrg").findOne({});
    expect(row!.organizationUnits).toBeGreaterThan(20);
    expect(row!.treasury).toBeLessThan(10000000);
    const receipts = await db.collection("treasuryTransactions").find({}).toArray();
    expect(receipts).toHaveLength(1);
    expect(10000000 - row!.treasury).toBe(receipts[0].amount);
  });
  it("native overlapping first NPP ballots leave one candidate per voter", async () => {
    const a = new ObjectId(),
      b = new ObjectId(),
      voter = `npp_${new ObjectId()}`;
    await db.collection("speakerNominations").insertMany([
      { _id: a, status: "open", votes: {}, votesFor: 0 },
      { _id: b, status: "open", votes: {}, votesFor: 0 },
    ]);
    await Promise.all(
      [a, b].map((nominationId) =>
        castLeadershipVoteBatch(
          db,
          "speakerNominations",
          [{ voterKey: voter, nominationId, seatWeight: 3 }],
          new Date(0)
        )
      )
    );
    const rows = await db.collection("speakerNominations").find({}).toArray();
    expect(rows.filter((row) => row.votes[voter])).toHaveLength(1);
    expect(rows.reduce((sum, row) => sum + row.votesFor, 0)).toBe(3);
  });
  it("native interrupted weighted ballot move rolls back old and new tallies", async () => {
    const a = new ObjectId(),
      b = new ObjectId(),
      voter = `npp_${new ObjectId()}`;
    await db.collection("houseLeadershipNominations").insertMany([
      { _id: a, status: "voting", role: "majority_leader", votes: { [voter]: "for" }, votesFor: 4 },
      { _id: b, status: "open", role: "majority_leader", votes: {}, votesFor: 0 },
    ]);
    let writes = 0;
    const faulty = intercept(
      db,
      "houseLeadershipNominations",
      "bulkWrite",
      async () => {
        if (++writes === 2) throw new Error("Synthetic landed ballot move");
      },
      true
    );
    const vote = { voterKey: voter, nominationId: b, seatWeight: 4 };
    await expect(
      castLeadershipVoteBatch(faulty, "houseLeadershipNominations", [vote], new Date(0))
    ).rejects.toThrow("Synthetic landed");
    expect((await db.collection("houseLeadershipNominations").findOne({ _id: a }))!.votesFor).toBe(
      4
    );
    expect((await db.collection("houseLeadershipNominations").findOne({ _id: b }))!.votesFor).toBe(
      0
    );
    await castLeadershipVoteBatch(db, "houseLeadershipNominations", [vote], new Date(0));
    await castLeadershipVoteBatch(db, "houseLeadershipNominations", [vote], new Date(0));
    expect((await db.collection("houseLeadershipNominations").findOne({ _id: a }))!.votesFor).toBe(
      0
    );
    expect((await db.collection("houseLeadershipNominations").findOne({ _id: b }))!.votesFor).toBe(
      4
    );
  });
  it("native first human ballot races retain one authoritative ballot and one vote", async () => {
    const a = new ObjectId(),
      b = new ObjectId(),
      voterCharacterId = new ObjectId();
    await db
      .collection("houseLeadershipBallots")
      .createIndex({ role: 1, voterCharacterId: 1 }, { unique: true });
    await db.collection("houseLeadershipNominations").insertMany([
      { _id: a, status: "open", role: "majority_leader", votes: {}, votesFor: 0 },
      { _id: b, status: "open", role: "majority_leader", votes: {}, votesFor: 0 },
    ]);
    const results = await Promise.allSettled(
      [a, b].map((nominationId) =>
        castLeadershipVoteBallot(db, {
          ballotCollectionName: "houseLeadershipBallots",
          nominationCollectionName: "houseLeadershipNominations",
          nominationId,
          voterCharacterId,
          role: "majority_leader",
          now: new Date(0),
        })
      )
    );
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    expect(await db.collection("houseLeadershipBallots").countDocuments({})).toBe(1);
    const rows = await db.collection("houseLeadershipNominations").find({}).toArray();
    expect(rows.filter((row) => row.votes[voterCharacterId.toString()])).toHaveLength(1);
    expect(rows.reduce((sum, row) => sum + row.votesFor, 0)).toBe(1);
  });
});
