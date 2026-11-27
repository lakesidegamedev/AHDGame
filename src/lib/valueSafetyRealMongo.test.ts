import { processPartyActionGeneration } from "./turn/partyActionGeneration";
import { processRegDriftDecay } from "./turn/partyOrg/regDriftDecay";
import { createInitialCampaign } from "./campaigns/createInitialCampaign";
import { runMetricEngine } from "./metricEngine/phase";
import { bookExtractionDepletion } from "./turn/commodity/extractionDepletion";
import type { ExtractionSectorInput } from "./turn/extraction/extractionCapacity";
import { resolveCorporationVoteIfReady } from "./corporations/votes/voteService";
import type { CorporationVote } from "./db/types/corporationVote";
import { publishCorporateTurnHistory } from "./turn/corporation/publishCorporateTurnHistory";
import { corporationHistoryFixture } from "./test-utils/corporationHistoryFixture";
import { tallyPublicationFilter } from "./elections/tallyPublication";
import { runNpcLegislatorAutoVote } from "./sovereignDefault/npc/npcLegislatorAutoVote";
import { placePendingShareIssuances } from "./equities/primaryMarket";
import { archivedDeletionFilter } from "./retention/rules/archivedDeletionFilter";
import { processGovernorExecutiveOrders } from "./turn/governorOrders";
import { rescindOrder } from "./governorOffice/orders/rescindOrder";
import { withdrawExecutiveEndorsement } from "./governorOffice/endorsements/withdrawExecutiveEndorsement";
import { runPensionTurn } from "./pensions/pensionTurn";
import { transferBankCharterToAcquirer } from "./banking/transferCharter";
import { withRecordedEconomicCommand } from "./api/withRecordedEconomicCommand";
import { topUpDefenceTenderReservation } from "./governmentContracts/reservations";
import type { GovernmentTender } from "./governmentContracts/types";
import { advanceContract } from "./db/collections/defenceContracts";
import { depositLots } from "./db/collections/nationalArsenal";
import { NextResponse } from "next/server";
import { recordedCasinoResponse } from "./casino/recordedResponse";
import { takeStake, settleHouseBet, houseLimits, CASINO_FUND_NAME } from "./casino/house";
import { startHighLow, actHighLow } from "./casino/highlowSessions";
import { applyBoardDelta } from "./politicalLegislation/boardWrite";
import { executeFundCrossRebalancing } from "./indexFunds/fundCrossRebalancing";
import { snapshotMetricHistory } from "./metricHistory";
import { snapshotInterestRateHistory } from "./turn/interestRateSnapshot";
import { generateWealthListSnapshots } from "./turn/investorWealthSnapshots";
import { GET as getWealthList } from "./api/commands/stock-exchange/wealth-list/handlers";
import {
  creditSharesToCorp,
  creditSharesToFund,
  creditSharesToNpp,
} from "./corporations/shareholderOps";
import { upsertFundHoldingShares, debitFundPosition } from "./indexFunds/fundQueries";
import { generateStockExchangeSnapshots } from "./turn/stockExchangeSnapshot";
import { BSON } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { withSessionDb } from "./db/sessionDb";
import { processSavingsInterestTurn } from "./turn/savingsInterestTurn";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/analytics/serverPosthog", async (original) => ({
  ...(await original<typeof import("@/lib/analytics/serverPosthog")>()),
  captureServerGameEvent: vi.fn(async () => {}),
}));
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type Db, type Document, ObjectId } from "mongodb";
import {
  startIsolatedMongod,
  stopIsolatedMongod,
  REAL_MONGO_ENABLED,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import { withAtomicEconomicCommand } from "./api/withAtomicEconomicCommand";
import { distributeConversionSpreadsBatch } from "./currency/marketMaker";
import { expireStaleOrders } from "./turn/forexLimitOrders";

type Row = Document & { _id: string | ObjectId };
function intercept(
  db: Db,
  name: string,
  method: string,
  work: (args: unknown[], run: () => Promise<unknown>) => Promise<unknown>
): Db {
  return new Proxy(db, {
    get(target, key) {
      if (key !== "collection") {
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return (requested: string) => {
        const collection = target.collection(requested);
        return new Proxy(collection, {
          get(c, k) {
            const value = Reflect.get(c, k);
            if (typeof value !== "function") return value;
            return (...args: unknown[]) =>
              requested === name && k === method
                ? work(args, () => value.apply(c, args))
                : value.apply(c, args);
          },
        });
      };
    },
  });
}
const pause = () => {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

describe.skipIf(!REAL_MONGO_ENABLED)("value safety on an owned Mongo replica set", () => {
  let mongo: IsolatedMongod | null = null,
    db: Db;
  beforeAll(async () => {
    mongo = await startIsolatedMongod("ahd-value-safety-", {
      replicaSet: "valueSafety",
      monitorCommands: true,
    });
    const host = new URL(mongo.uri).host;
    await mongo.client
      .db("admin")
      .command({ replSetInitiate: { _id: "valueSafety", members: [{ _id: 0, host }] } });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const hello = await mongo.client.db("admin").command({ hello: 1 });
      if (hello.isWritablePrimary) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect((await mongo.client.db("admin").command({ hello: 1 })).isWritablePrimary).toBe(true);
    db = mongo.db;
  }, 60000);
  afterAll(async () => {
    await stopIsolatedMongod(mongo);
  }, 30000);
  beforeEach(async () => {
    vi.mocked(getDb).mockResolvedValue(db);
    await db.dropDatabase();
    await db.collection<Row>("gameState").insertOne({
      _id: "current",
      currentTurn: 100,
      isProcessing: false,
      worldEpochId: new ObjectId().toString(),
    });
  });
  it("retries a stale turn read and refuses the economic command when turn acquisition wins", async () => {
    const read = pause(),
      advance = pause();
    let first = true;
    const observed = intercept(db, "gameState", "findOne", async (_args, run) => {
      const result = await run();
      if (first) {
        first = false;
        read.release();
        await advance.promise;
      }
      return result;
    });
    const command = withAtomicEconomicCommand(observed, async (tx) => {
      await tx
        .collection<Row>("wallets")
        .updateOne({ _id: "owner" }, { $inc: { cash: 100 } }, { upsert: true });
      return new Response("ok");
    });
    await read.promise;
    await db
      .collection<Row>("gameState")
      .updateOne({ _id: "current" }, { $set: { isProcessing: true } });
    advance.release();
    expect((await command).status).toBe(409);
    expect(await db.collection("wallets").countDocuments()).toBe(0);
    expect(
      (await db.collection<Row>("gameState").findOne({ _id: "current" }))?.economicCommandRevision
    ).toBeUndefined();
  }, 20000);
  it("lets an already fenced action commit before a waiting turn starts", async () => {
    const inside = pause(),
      finish = pause();
    const command = withAtomicEconomicCommand(db, async (tx) => {
      inside.release();
      await finish.promise;
      await tx.collection<Row>("wallets").insertOne({ _id: "owner", cash: 100 });
      return new Response("ok");
    });
    await inside.promise;
    const turn = db
      .collection<Row>("gameState")
      .updateOne({ _id: "current" }, { $set: { isProcessing: true } });
    finish.release();
    expect((await command).status).toBe(200);
    expect((await turn).matchedCount).toBe(1);
    expect((await db.collection<Row>("wallets").findOne({ _id: "owner" }))?.cash).toBe(100);
  }, 20000);
  it("rolls back an acknowledged partial bank batch and resolves concurrent fee replays once", async () => {
    await db.collection<Row>("centralBanks").insertMany([
      { _id: "US", forexRevenue: 0 },
      { _id: "JP", spreadFeeReserveBalances: { USD: 0 } },
    ]);
    let fail = true;
    const interrupted = intercept(db, "centralBanks", "bulkWrite", async (args, run) => {
      if (fail) {
        fail = false;
        const operations = args[0] as Document[];
        await db
          .collection("centralBanks")
          .bulkWrite(operations.slice(0, 1) as never, args[1] as never);
        throw new Error("bank acknowledgement lost");
      }
      return run();
    });
    const fees = [{ fee: 100, fromCurrency: "USD" as const, toCurrency: "JPY" as const }],
      key = { key: "corporation-operating-fx:100", turn: 100 };
    await expect(distributeConversionSpreadsBatch(interrupted, fees, key)).rejects.toThrow(
      "bank acknowledgement lost"
    );
    expect((await db.collection<Row>("centralBanks").findOne({ _id: "US" }))?.forexRevenue).toBe(0);
    expect(await db.collection("bankMoneyMoves").countDocuments()).toBe(0);
    await Promise.all(
      Array.from({ length: 4 }, () => distributeConversionSpreadsBatch(db, fees, key))
    );
    expect((await db.collection<Row>("centralBanks").findOne({ _id: "US" }))?.forexRevenue).toBe(
      25
    );
    expect(
      (await db.collection<Row>("centralBanks").findOne({ _id: "JP" }))?.spreadFeeReserveBalances
    ).toEqual({ USD: 50 });
    expect(await db.collection("bankMoneyMoves").countDocuments()).toBe(1);
  }, 20000);
  it("refunds expiry escrow once across real concurrent transactions and retains missing-owner claims", async () => {
    const owner = new ObjectId(),
      order = new ObjectId(),
      orphan = new ObjectId();
    await db
      .collection<Row>("characters")
      .insertOne({ _id: owner, currencyBalances: { personal: { USD: 0 } } });
    await db.collection<Row>("currencyOrders").insertMany([
      {
        _id: order,
        characterId: owner,
        status: "partial",
        amount: 1000,
        filledAmount: 200,
        fromCurrency: "USD",
        expiresAtTurn: 1,
      },
      {
        _id: orphan,
        characterId: new ObjectId(),
        status: "open",
        amount: 1000,
        filledAmount: 0,
        fromCurrency: "USD",
        expiresAtTurn: 1,
      },
    ]);
    await Promise.all(Array.from({ length: 4 }, () => expireStaleOrders(db, 100, new Date())));
    expect(
      (await db.collection<Row>("characters").findOne({ _id: owner }))?.currencyBalances
    ).toEqual({ personal: { USD: 800 } });
    expect(
      (await db.collection<Row>("currencyOrders").findOne({ _id: order }))?.expiryRefundState
    ).toBeUndefined();
    expect(
      (await db.collection<Row>("currencyOrders").findOne({ _id: orphan }))?.expiryRefundState
    ).toBe("pending");
  }, 20000);
  async function savingsWorld() {
    const owner = new ObjectId();
    await db
      .collection<Row>("gameState")
      .updateOne(
        { _id: "current" },
        { $set: { preset: "2027-default", resetWorldId: "synthetic", forexEnabled: true } }
      );
    await db.collection<Row>("gameConfig").insertOne({
      _id: "default",
      privateBankingEnabled: true,
      savingsAccountsMode: "authoritative",
      savingsAccountsReadCurrencies: ["USD"],
    });
    await db.collection<Row>("centralBanks").insertOne({
      _id: "US",
      primeRate: 10,
      nationalSavingsBalance: 10000,
      inflationHistory: [{ rate: 0 }],
    });
    await db
      .collection<Row>("exchangeRates")
      .insertOne({ _id: "US", currencyCode: "USD", rate: 1 });
    await db.collection<Row>("characters").insertOne({
      _id: owner,
      name: "Synthetic saver",
      countryId: "US",
      homeState: "TX",
      currencyBalances: {
        personal: { USD: 0 },
        savings: { USD: 10000 },
        savingsHolder: { USD: "centralBank" },
        pendingSavingsInterest: { USD: 0 },
        interestEarned: { USD: 0 },
      },
    });
    await db.collection<Row>("savingsAccounts").insertOne({
      _id: "synthetic",
      ownerType: "character",
      ownerId: owner,
      currency: "USD",
      balance: 10000,
      accruedInterest: 0,
      interestEarned: 0,
      version: 0,
      holder: { type: "centralBank", id: "US" },
    });
    return owner;
  }
  it("replans accrual when a completed withdrawal races the character snapshot", async () => {
    const owner = await savingsWorld(),
      planned = pause(),
      withdrawn = pause();
    let first = true;
    const observed = intercept(db, "characters", "bulkWrite", async (_args, run) => {
      if (first) {
        first = false;
        planned.release();
        await withdrawn.promise;
      }
      return run();
    });
    const accrual = processSavingsInterestTurn(observed, 10, false);
    await planned.promise;
    await withSessionDb(db, async (tx) => {
      await tx.collection<Row>("characters").updateOne(
        { _id: owner },
        {
          $set: { "currencyBalances.savings.USD": 0 },
          $inc: { "currencyBalances.personal.USD": 10000 },
        }
      );
      await tx
        .collection<Row>("savingsAccounts")
        .updateOne({ _id: "synthetic" }, { $set: { balance: 0 } });
    });
    withdrawn.release();
    await accrual;
    expect(
      (await db.collection<Row>("characters").findOne({ _id: owner }))?.currencyBalances
    ).toMatchObject({
      personal: { USD: 10000 },
      savings: { USD: 0 },
      pendingSavingsInterest: { USD: 0 },
    });
    expect(await db.collection<Row>("savingsAccounts").findOne({ _id: "synthetic" })).toMatchObject(
      { balance: 0, accruedInterest: 0 }
    );
  }, 20000);
  it("joins quarterly tax settlement to the phase transaction without a nested-session deadlock", async () => {
    const owner = await savingsWorld();
    let fail = true;
    const interrupted = intercept(db, "savingsLedger", "insertMany", async (_args, run) => {
      const result = await run();
      if (fail) {
        fail = false;
        throw new Error("quarterly receipt acknowledgement lost");
      }
      return result;
    });
    await expect(processSavingsInterestTurn(interrupted, 12, false)).rejects.toThrow(
      "quarterly receipt acknowledgement lost"
    );
    expect(
      (await db.collection<Row>("characters").findOne({ _id: owner }))?.currencyBalances.savings.USD
    ).toBe(10000);
    expect(await db.collection("playerIncomeTaxBatches").countDocuments()).toBe(0);
    await Promise.all([
      processSavingsInterestTurn(db, 12, false),
      processSavingsInterestTurn(db, 12, false),
    ]);
    expect(
      (await db.collection<Row>("characters").findOne({ _id: owner }))?.currencyBalances.savings.USD
    ).toBe(10002.6);
    expect(await db.collection("savingsLedger").countDocuments()).toBe(1);
    expect(
      (await db.collection<Row>("savingsAccounts").findOne({ _id: "synthetic" }))?.balance
    ).toBe(10002.6);
  }, 20000);
  it("publishes the latest settled history using frozen currency quotes on the real aggregation", async () => {
    const usd = new ObjectId(),
      cad = new ObjectId();
    await db.collection("corporations").insertMany([
      {
        _id: usd,
        sequentialId: 1,
        name: "Synthetic USD",
        countryId: "US",
        liquidCurrencyCode: "USD",
        headquartersState: "NY",
        type: "agriculture",
        sharePrice: 10,
        totalShares: 100,
        publicFloat: 100,
        ceoVacant: true,
        marketingBudget: 1e9,
      },
      {
        _id: cad,
        sequentialId: 2,
        name: "Synthetic CAD",
        countryId: "CA",
        liquidCurrencyCode: "CAD",
        headquartersState: "ON",
        type: "agriculture",
        sharePrice: 10,
        totalShares: 100,
        publicFloat: 100,
        ceoVacant: true,
      },
    ]);
    await db.collection("exchangeRates").insertMany([
      { currencyCode: "USD", rate: 1 },
      { currencyCode: "CAD", rate: 1.5 },
      { currencyCode: "JPY", rate: 300 },
    ]);
    await db.collection("corporationHistory").createIndex({ corporationId: 1, turn: -1 });
    await db.collection("corporationHistory").insertMany([
      { corporationId: usd, turn: 98, income: 1e12, revenue: 1e12 },
      {
        corporationId: usd,
        turn: 99,
        income: 500,
        revenue: 1000,
        currencyCode: "USD",
        fxRateAtWrite: 1,
        settledBankLoanInterestPaid: 50,
        settledBondCouponIncome: 20,
        settledBondInterestPaid: 10,
        dividendIncomeReceived: 5,
        sharePrice: 10,
        totalShares: 100,
      },
      {
        corporationId: cad,
        turn: 99,
        income: 50000,
        revenue: 100000,
        currencyCode: "JPY",
        fxRateAtWrite: 150,
        settledBankLoanInterestPaid: 100,
        settledBondCouponIncome: 0,
        settledBondInterestPaid: 0,
        sharePrice: 10,
        totalShares: 100,
      },
    ]);
    const commands: Record<string, number> = {};
    let returnedBytes = 0;
    const started = (event: { commandName: string }) => {
      commands[event.commandName] = (commands[event.commandName] ?? 0) + 1;
    };
    const succeeded = (event: { reply: Document }) => {
      returnedBytes += BSON.calculateObjectSize(event.reply);
    };
    mongo!.client.on("commandStarted", started);
    mongo!.client.on("commandSucceeded", succeeded);
    try {
      await generateStockExchangeSnapshots(100, db);
    } finally {
      mongo!.client.off("commandStarted", started);
      mongo!.client.off("commandSucceeded", succeeded);
    }
    const snapshot = await db.collection<Row>("stockExchangeSnapshots").findOne({ _id: "global" });
    const listings = snapshot!.listings as {
      _id: ObjectId;
      income: number | null;
      totalRevenue: number;
      incomeBasis: string;
      incomeTurn: number;
    }[];
    const us = listings.find((row) => row._id.equals(usd));
    const ca = listings.find((row) => row._id.equals(cad));
    expect(us).toMatchObject({
      income: 465 * 24,
      totalRevenue: 1000 * 24,
      incomeBasis: "settled",
      incomeTurn: 99,
    });
    expect(ca).toMatchObject({
      income: 499 * 24,
      totalRevenue: 1000 * 24,
      incomeBasis: "settled",
      incomeTurn: 99,
    });
    expect(commands.aggregate).toBeGreaterThan(0);
    console.info("Synthetic two-company exchange query profile", { commands, returnedBytes });
    await db
      .collection("corporationHistory")
      .updateOne({ corporationId: usd, turn: 99 }, { $unset: { settledBankLoanInterestPaid: "" } });
    await generateStockExchangeSnapshots(100, db);
    const incomplete = await db
      .collection<Row>("stockExchangeSnapshots")
      .findOne({ _id: "global" });
    expect(
      incomplete!.listings.find((row: { _id: ObjectId }) => row._id.equals(usd))
    ).toMatchObject({ income: null, incomeBasis: "unavailable" });
  }, 20000);

  it.each(["corporation", "fund", "npp"] as const)(
    "keeps %s share quantity and weighted cost atomic under concurrent credits",
    async (kind) => {
      const target = new ObjectId(),
        owner = new ObjectId();
      const key = kind === "corporation" ? "corporationId" : kind === "fund" ? "fundId" : "nppId";
      await db.collection("corporations").insertOne({
        _id: target,
        shareholders: [{ [key]: owner, shares: 10, avgCostPerShare: 1 }],
      });
      const credit =
        kind === "corporation"
          ? creditSharesToCorp
          : kind === "fund"
            ? creditSharesToFund
            : creditSharesToNpp;
      await Promise.all([credit(db, target, owner, 10, 2), credit(db, target, owner, 20, 4)]);
      const row = await db.collection("corporations").findOne({ _id: target });
      expect(row!.shareholders).toHaveLength(1);
      expect(row!.shareholders[0]).toMatchObject({ shares: 40, avgCostPerShare: 2.75 });
    }
  );
  it("merges concurrent in-kind fund holdings instead of inserting duplicate issuer positions", async () => {
    const fund = new ObjectId(),
      issuer = new ObjectId();
    await db.collection("indexFunds").insertOne({ _id: fund, holdings: [] });
    await Promise.all([
      upsertFundHoldingShares(db, fund, issuer, 10, 2),
      upsertFundHoldingShares(db, fund, issuer, 10, 4),
    ]);
    const row = await db.collection("indexFunds").findOne({ _id: fund });
    expect(row!.holdings).toHaveLength(1);
    expect(row!.holdings[0]).toMatchObject({ shares: 20, avgCostPerShareAnchor: 3 });
  });
  it("does not delete units credited between a zeroing debit and position cleanup", async () => {
    const fund = new ObjectId(),
      owner = new ObjectId(),
      position = new ObjectId();
    await db.collection("indexFundPositions").insertOne({
      _id: position,
      fundId: fund,
      holderKind: "npp",
      nppId: owner,
      units: 10,
      avgNavAnchor: 2,
    });
    const raced = intercept(db, "indexFundPositions", "deleteOne", async (_args, run) => {
      await db
        .collection("indexFundPositions")
        .updateOne({ _id: position }, { $inc: { units: 5 } });
      return run();
    });
    const result = await debitFundPosition(raced, fund, "npp", { nppId: owner }, 10);
    expect(result).toMatchObject({ ok: true, position: { units: 5 } });
    expect((await db.collection("indexFundPositions").findOne({ _id: position }))!.units).toBe(5);
  });
  it("keeps legacy savings and LOC debt in real snapshot and fallback projections", async () => {
    const owner = new ObjectId(),
      user = new ObjectId();
    await db.collection("exchangeRates").insertOne({ currencyCode: "USD", rate: 1 });
    await db.collection("characters").insertOne({
      _id: owner,
      userId: user,
      name: "Synthetic debtor",
      homeState: "NY",
      countryId: "US",
      cashOnHand: 100,
      savingsOnHand: 20,
      lineOfCredit: { balances: { USD: 40 }, arrears: { USD: 2 } },
    });
    await db.collection("users").insertOne({ _id: user, isBanned: false });
    const request = new Request("http://localhost/api/stock-exchange/wealth-list?exchange=global");
    const fallback = await getWealthList(request);
    expect(fallback.status).toBe(200);
    const body = await fallback.json();
    expect(body.entries[0]).toMatchObject({ cashValue: 120, locDebtValue: 42, totalWealth: 78 });
    await generateWealthListSnapshots(100, db);
    const snapshot = await db.collection<Row>("wealthListSnapshots").findOne({ _id: "global" });
    expect(snapshot!.entries[0]).toMatchObject({
      cashValue: 120,
      locDebtValue: 42,
      totalWealth: 78,
    });
    expect((await db.collection("characters").findOne({ _id: owner }))!.cashOnHand).toBe(100);
  });

  it("freezes macro and central-bank snapshots once for a turn despite changed inputs and concurrent retries", async () => {
    const bank = new ObjectId();
    await db.collection<Row>("macroMetrics").insertMany([
      { _id: "NY", countryId: "US", economic: { gdpGrowth: { value: 4 } } },
      { _id: "federal", countryId: "US", economic: { gdpGrowth: { value: 4 } } },
    ]);
    await db
      .collection("centralBanks")
      .insertOne({ _id: bank, countryId: "US", primeRate: 5, currentSavingsPressure: 1 });
    await snapshotMetricHistory(db, 100);
    await snapshotInterestRateHistory(db, 100);
    await db.collection("macroMetrics").updateMany({}, { $set: { "economic.gdpGrowth.value": 9 } });
    await db.collection("centralBanks").updateOne({ _id: bank }, { $set: { primeRate: 7 } });
    await Promise.all([snapshotMetricHistory(db, 100), snapshotMetricHistory(db, 100)]);
    await Promise.all([snapshotInterestRateHistory(db, 100), snapshotInterestRateHistory(db, 100)]);
    const first = await db.collection<Row>("macroMetricsHistory").findOne({ _id: "NY" });
    expect(first!.economic.gdpGrowth).toEqual([{ turn: 100, value: 4 }]);
    expect(
      (await db.collection("centralBanks").findOne({ _id: bank }))!.interestRateHistory
    ).toEqual([{ turn: 100, rate: 5 }]);
    await snapshotMetricHistory(db, 101);
    await snapshotInterestRateHistory(db, 101);
    expect(
      (await db.collection<Row>("macroMetricsHistory").findOne({ _id: "NY" }))!.economic.gdpGrowth
    ).toEqual([
      { turn: 100, value: 4 },
      { turn: 101, value: 9 },
    ]);
    expect(
      (await db.collection("centralBanks").findOne({ _id: bank }))!.interestRateHistory
    ).toEqual([
      { turn: 100, rate: 5 },
      { turn: 101, rate: 7 },
    ]);
  });
  it("rolls back an interrupted macro snapshot cohort before retrying its publication", async () => {
    await db.collection<Row>("macroMetrics").insertMany([
      { _id: "NY", economic: { gdpGrowth: { value: 4 } } },
      { _id: "federal", economic: { gdpGrowth: { value: 4 } } },
    ]);
    let writes = 0;
    const fault = intercept(db, "macroMetricsHistory", "bulkWrite", async (_args, run) => {
      const result = await run();
      if (++writes === 2) throw new Error("Lost national history acknowledgement");
      return result;
    });
    await expect(snapshotMetricHistory(fault, 100)).rejects.toThrow("Lost national history");
    expect(await db.collection("macroMetricsHistory").countDocuments()).toBe(0);
    await snapshotMetricHistory(db, 100);
    expect(await db.collection("macroMetricsHistory").countDocuments()).toBe(2);
  });
  it("retries a board snapshot after another family changes rather than overwriting it", async () => {
    await db.collection<Row>("politicalMetrics").insertOne({
      _id: "TX",
      countryId: "US",
      values: { "governance.integrity": 50, "economy.stability": 50 },
      residuals: {},
    });
    const read = pause(),
      resume = pause();
    let first = true;
    const delayed = intercept(db, "politicalMetrics", "bulkWrite", async (_args, run) => {
      if (first) {
        first = false;
        read.release();
        await resume.promise;
      }
      return run();
    });
    const a = applyBoardDelta(delayed, { countryId: "US" }, "governance.integrity", -10, "value");
    await read.promise;
    await applyBoardDelta(db, { countryId: "US" }, "economy.stability", 5, "value");
    resume.release();
    await a;
    expect((await db.collection<Row>("politicalMetrics").findOne({ _id: "TX" }))!.values).toEqual({
      "governance.integrity": 40,
      "economy.stability": 55,
    });
  });
  it("keeps concurrent cross-fund transfers paired and does not erase unrelated holdings", async () => {
    const corporationId = new ObjectId(),
      sellerFundId = new ObjectId(),
      buyerFundId = new ObjectId(),
      other = new ObjectId();
    await db.collection("corporations").insertOne({
      _id: corporationId,
      sharePrice: 4,
      fundamentalSharePrice: 4,
      totalShares: 100,
      publicFloat: 0,
      liquidCurrencyCode: "USD",
      shareholders: [{ fundId: sellerFundId, shares: 20, avgCostPerShare: 2 }],
    });
    await db.collection("indexFunds").insertMany([
      {
        _id: sellerFundId,
        name: "Seller",
        status: "active",
        anchorCurrencyCode: "USD",
        cashAnchor: 10,
        holdings: [{ corporationId, shares: 20, avgCostPerShareAnchor: 2 }],
      },
      {
        _id: buyerFundId,
        name: "Buyer",
        status: "active",
        anchorCurrencyCode: "USD",
        cashAnchor: 100,
        holdings: [{ corporationId: other, shares: 3, avgCostPerShareAnchor: 7 }],
      },
    ]);
    await db.collection("exchangeRates").insertOne({ currencyCode: "USD", rate: 1 });
    const plan = {
      corporationId,
      sellerFundId,
      buyerFundId,
      shares: 5,
      pricePerShareAnchor: 4,
      valueAnchor: 20,
    };
    const reports = await Promise.all([
      executeFundCrossRebalancing(db, [plan], 100),
      executeFundCrossRebalancing(db, [plan], 100),
    ]);
    expect(reports.every((r) => r.transfers === 1 && !r.errors.length)).toBe(true);
    const funds = await db.collection("indexFunds").find({}).toArray();
    expect(funds.map((f) => f.cashAnchor)).toEqual([30, 80]);
    expect(funds[1].holdings).toEqual(
      expect.arrayContaining([expect.objectContaining({ corporationId: other, shares: 3 })])
    );
    expect(await db.collection("indexFundTransactions").countDocuments()).toBe(2);
  });
  it("returns one recorded casino settlement to concurrent requests without double debits or winnings", async () => {
    const characterId = new ObjectId();
    const player = {
      characterId,
      characterName: "Synthetic",
      discordId: "fixture",
      countryId: "CA",
      currency: "CAD" as const,
      rate: 2,
    };
    await db
      .collection("characters")
      .insertOne({ _id: characterId, currencyBalances: { personal: { CAD: 1000 } } });
    await db
      .collection("discordBotFunds")
      .insertOne({ name: CASINO_FUND_NAME, anchorBalance: 1000 });
    const run = () =>
      recordedCasinoResponse(db, "instant:fixture:one", { stake: 20 }, async (db) => {
        const limits = houseLimits(1000);
        expect((await takeStake(db, player, 20, limits)).ok).toBe(true);
        return NextResponse.json(
          await settleHouseBet(db, {
            player,
            game: "slots",
            stakeLocal: 20,
            multiplier: 2,
            limits,
            meta: { playId: "one" },
          })
        );
      });
    const replies = await Promise.all([run(), run(), run()]);
    expect(await replies[0].json()).toEqual(await replies[1].json());
    expect(
      (await db.collection("characters").findOne({ _id: characterId }))!.currencyBalances.personal
        .CAD
    ).toBe(1020);
    expect(
      (await db.collection("discordBotFunds").findOne({ name: CASINO_FUND_NAME }))!.anchorBalance
    ).toBe(990);
    expect(
      await db
        .collection("financialTxLog")
        .countDocuments({ type: { $in: ["casino_wager", "casino_payout"] } })
    ).toBe(2);
  });
  it("resolves racing high-low starts and payouts against a single spending wallet", async () => {
    const characterId = new ObjectId();
    const player = {
      characterId,
      characterName: "Synthetic",
      discordId: "fixture",
      countryId: "CA",
      currency: "CAD" as const,
      rate: 2,
    };
    await db
      .collection("characters")
      .insertOne({ _id: characterId, currencyBalances: { personal: { CAD: 1000 } } });
    await db
      .collection("discordBotFunds")
      .insertOne({ name: CASINO_FUND_NAME, anchorBalance: 1000 });
    const starts = await Promise.all([
      startHighLow(db, player, 20, () => 0.4),
      startHighLow(db, player, 20, () => 0.4),
    ]);
    expect(starts.filter((r) => r.ok)).toHaveLength(1);
    const hand = await db.collection("casinoHighLowSessions").findOne({ status: "active" });
    expect(hand).not.toBeNull();
    await db
      .collection("casinoHighLowSessions")
      .updateOne({ _id: hand!._id }, { $set: { steps: 1, multiplier: 2 } });
    await Promise.all([
      actHighLow(db, "fixture", hand!._id.toString(), "cashout"),
      actHighLow(db, "fixture", hand!._id.toString(), "cashout"),
    ]);
    expect(
      (await db.collection("characters").findOne({ _id: characterId }))!.currencyBalances.personal
        .CAD
    ).toBe(1020);
    expect(
      (await db.collection("discordBotFunds").findOne({ name: CASINO_FUND_NAME }))!.anchorBalance
    ).toBe(990);
  });
  it("records one economic response under racing lost-reply retries and rejects conflicting details", async () => {
    await db.collection<Row>("wallets").insertOne({ _id: "saver", cash: 1000 });
    const run = (amount = 100) =>
      withRecordedEconomicCommand(
        db,
        "savings-command-test",
        "actor",
        "same",
        { amount },
        async (db) => {
          await db
            .collection<Row>("wallets")
            .updateOne({ _id: "saver", cash: { $gte: amount } }, { $inc: { cash: -amount } });
          return NextResponse.json({ success: true, amount });
        }
      );
    const responses = await Promise.all([run(), run(), run()]);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect((await db.collection<Row>("wallets").findOne({ _id: "saver" }))!.cash).toBe(900);
    expect((await run(101)).status).toBe(409);
    expect((await db.collection<Row>("wallets").findOne({ _id: "saver" }))!.cash).toBe(900);
  });
  it("preserves quota and appropriation totals when stale tender top-ups race", async () => {
    const tender = {
      _id: "synthetic",
      countryId: "US",
      allocationWindowId: "US:0",
      reservedAmount: 100,
    } as GovernmentTender;
    await db.collection<Row>("defenceProcurementAllocations").insertOne({
      _id: "US:0",
      countryAmount: 100,
      governmentTenderReservations: {
        synthetic: { state: "held", amount: 100, leaseRevision: 4 },
      },
    });
    await db.collection<Row>("federalBudget").insertOne({
      _id: "budget",
      countryId: "US",
      defenseAppropriation: {
        balance: 1000,
        encumbered: 100,
        governmentTenderReservations: { synthetic: { state: "held", amount: 100 } },
      },
    });
    await Promise.all([1, 2, 3].map(() => topUpDefenceTenderReservation(db, tender, 150, 1000000)));
    expect(
      (await db.collection<Row>("defenceProcurementAllocations").findOne({ _id: "US:0" }))!
        .countryAmount
    ).toBe(150);
    expect(
      (await db.collection<Row>("federalBudget").findOne({ _id: "budget" }))!.defenseAppropriation
        .encumbered
    ).toBe(150);
  });
  it("caps racing delivery records and recomputes weighted arsenal grade after write conflicts", async () => {
    const contract = new ObjectId();
    await db
      .collection("defenceContracts")
      .insertOne({ _id: contract, status: "active", lotsOrdered: 10, lotsDelivered: 0 });
    const results = await Promise.all([
      advanceContract(db, contract, 6),
      advanceContract(db, contract, 6),
    ]);
    expect(results.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(10);
    await db
      .collection("nationalArsenal")
      .insertOne({ countryId: "US", stock: { ground: 10 }, grade: { ground: 0 } });
    await Promise.all([
      depositLots(db, "US", "ground", 10, 1),
      depositLots(db, "US", "ground", 10, 3),
    ]);
    expect(await db.collection("nationalArsenal").findOne({ countryId: "US" })).toMatchObject({
      stock: { ground: 30 },
      grade: { ground: 4 / 3 },
    });
  });

  it("retains a bank repayment accepted between the transfer read and original release", async () => {
    const source = new ObjectId(),
      destination = new ObjectId(),
      borrower = new ObjectId();
    await db.collection("corporations").insertMany([
      {
        _id: source,
        name: "Synthetic bank",
        bankCharter: {
          type: "retail",
          status: "active",
          currency: "USD",
          charteredTurn: 1,
          postedCapital: 100,
          cashReserves: 100,
          totalLoans: 0,
          totalDeposits: 0,
          npcDeposits: 0,
          depositOffset: 0,
          lendingOffset: 0,
        },
      },
      { _id: destination, name: "Synthetic acquirer" },
      { _id: borrower, liquidCapital: 100 },
    ]);
    const read = pause(),
      resume = pause();
    let first = true;
    const observed = intercept(db, "corporations", "findOne", async (args, run) => {
      const value = await run();
      if (first && String((args[0] as { _id?: ObjectId })._id) === String(source)) {
        first = false;
        read.release();
        await resume.promise;
      }
      return value;
    });
    const transfer = transferBankCharterToAcquirer(observed, source, destination, new Date());
    await read.promise;
    await withSessionDb(db, async (db) => {
      await db
        .collection("corporations")
        .updateOne({ _id: borrower }, { $inc: { liquidCapital: -10 } });
      await db
        .collection("corporations")
        .updateOne({ _id: source }, { $inc: { "bankCharter.cashReserves": 10 } });
    });
    resume.release();
    expect((await transfer).ok).toBe(true);
    expect(
      (await db.collection("corporations").findOne({ _id: source }))!.bankCharter
    ).toBeUndefined();
    expect(
      (await db.collection("corporations").findOne({ _id: destination }))!.bankCharter.cashReserves
    ).toBe(110);
    expect((await db.collection("corporations").findOne({ _id: borrower }))!.liquidCapital).toBe(
      90
    );
  });
  it("settles a CAD pension contribution, benefits and investment once with bounded per-scheme transactions", async () => {
    const company = new ObjectId(),
      union = new ObjectId(),
      sector = new ObjectId(),
      scheme = new ObjectId(),
      fund = new ObjectId(),
      agreement = new ObjectId();
    await db.collection("exchangeRates").insertMany([
      { currencyCode: "USD", rate: 1.25 },
      { currencyCode: "CAD", rate: 2 },
    ]);
    await db.collection("corporations").insertOne({
      _id: company,
      name: "Synthetic employer",
      countryId: "CA",
      liquidCurrencyCode: "CAD",
      liquidCapital: 5000000,
    });
    await db
      .collection("unions")
      .insertOne({ _id: union, name: "Synthetic union", countryId: "CA" });
    await db
      .collection("corporateSectors")
      .insertOne({ _id: sector, corporationId: company, laborCost: 240000 });
    await db.collection("collectiveAgreements").insertOne({
      _id: agreement,
      unionId: union,
      employerCorporationId: company,
      sectorIds: [sector],
      status: "active",
      startsAtTurn: 1,
      expiresAtTurn: 1000,
      pensionContributionRate: 0.1,
    });
    await db.collection("pensionSchemes").insertOne({
      _id: scheme,
      unionId: union,
      countryId: "CA",
      unionName: "Synthetic union",
      assetsAnchor: 2000000,
      liabilitiesAnchor: 3000000,
      benefitsInPaymentAnchor: 100000,
      totalContributionsAnchor: 0,
      totalTopUpsAnchor: 0,
    });
    await db.collection("indexFunds").insertOne({
      _id: fund,
      slug: "synthetic-ca",
      name: "Synthetic CA fund",
      scope: "country",
      kind: "broad",
      countryId: "CA",
      anchorCurrencyCode: "USD",
      status: "active",
      quotedNav: 100,
      unitSupply: 1000,
      cashAnchor: 100000,
    });
    let commands = 0,
      requestBytes = 0,
      responseBytes = 0;
    const requests = new Set<number>();
    const started = (event: { databaseName: string; requestId: number; command: Document }) => {
      if (event.databaseName === db.databaseName) {
        commands++;
        requestBytes += BSON.serialize(event.command).byteLength;
        requests.add(event.requestId);
      }
    };
    const succeeded = (event: { requestId: number; reply: Document }) => {
      if (requests.delete(event.requestId)) responseBytes += BSON.serialize(event.reply).byteLength;
    };
    mongo!.client.on("commandStarted", started);
    mongo!.client.on("commandSucceeded", succeeded);
    let result: Awaited<ReturnType<typeof runPensionTurn>>;
    try {
      result = await runPensionTurn(db, 100);
    } finally {
      mongo!.client.off("commandStarted", started);
      mongo!.client.off("commandSucceeded", succeeded);
    }
    expect(result!.errors).toEqual([]);
    expect(result!.benefits.errors).toEqual([]);
    expect(result!.investing.errors).toEqual([]);
    expect(result!.contributionsAnchor).toBeGreaterThan(0);
    expect(result!.investing.investedAnchor).toBeGreaterThan(0);
    const cash = async () =>
      (await db.collection("corporations").findOne({ _id: company }))!.liquidCapital / 2 +
      (await db.collection("pensionSchemes").findOne({ _id: scheme }))!.assetsAnchor +
      (await db.collection("indexFunds").findOne({ _id: fund }))!.cashAnchor;
    const closing = await cash();
    expect(closing).toBeCloseTo(4600000 - result!.benefits.benefitsPaidAnchor, 6);
    await Promise.all([runPensionTurn(db, 100), runPensionTurn(db, 100)]);
    expect(await cash()).toBe(closing);
    expect(
      await db.collection("financialTxLog").countDocuments({
        subjectType: "pension_scheme",
        type: "pension_benefit",
        currencyCode: "USD",
      })
    ).toBe(1);
    const receipt = await db
      .collection("financialTxLog")
      .findOne({ subjectType: "pension_scheme", type: "pension_benefit" });
    expect(receipt!.amount).toBeCloseTo(receipt!.anchorAmount * 1.25, 6);
    console.info(
      JSON.stringify({
        profile: "pension-turn-one-agreement-one-scheme",
        commands,
        requestBytes,
        responseBytes,
      })
    );
  });
  it("retains a newer bill when it races a manual executive-order restoration", async () => {
    const orderId = new ObjectId(),
      policyId = new ObjectId(),
      billId = new ObjectId();
    await db.collection("governorExecutiveOrders").insertOne({
      _id: orderId,
      countryId: "US",
      stateId: "TX",
      legislationTypeId: "law",
      status: "active",
      policyOptionIndexBefore: 1,
    });
    await db.collection("statePolicies").insertOne({
      _id: policyId,
      countryId: "US",
      stateId: "TX",
      legislationTypeId: "law",
      policyOptionIndex: 4,
      enactedBy: { kind: "order", id: orderId },
    });
    const read = pause(),
      resume = pause();
    let first = true;
    const observed = intercept(db, "statePolicies", "findOne", async (_args, run) => {
      const value = await run();
      if (first) {
        first = false;
        read.release();
        await resume.promise;
      }
      return value;
    });
    const pending = rescindOrder(observed, {
      orderId,
      countryId: "US",
      stateId: "TX",
      rescindedByCharacterId: new ObjectId(),
    });
    await read.promise;
    await db
      .collection("statePolicies")
      .updateOne(
        { _id: policyId },
        { $set: { policyOptionIndex: 2, enactedBy: { kind: "bill", id: billId } } }
      );
    resume.release();
    expect((await pending).status).toBe(200);
    expect(await db.collection("statePolicies").findOne({ _id: policyId })).toMatchObject({
      policyOptionIndex: 2,
      enactedBy: { kind: "bill", id: billId },
    });
    expect(await db.collection("governorExecutiveOrders").findOne({ _id: orderId })).toMatchObject({
      status: "superseded",
    });
  });
  it("reverses endorsement support once across actual competing withdrawal transactions", async () => {
    const endorsementId = new ObjectId(),
      candidateId = new ObjectId(),
      characterId = new ObjectId();
    await db.collection("executiveEndorsements").insertOne({
      _id: endorsementId,
      countryId: "CA",
      candidateId,
      candidateIsNPP: false,
      isActive: true,
    });
    await db
      .collection("electionCandidates")
      .insertOne({ _id: candidateId, characterId, status: "active", support: 50 });
    const responses = await Promise.all([
      withdrawExecutiveEndorsement(db, endorsementId, "manual", "CA"),
      withdrawExecutiveEndorsement(db, endorsementId, "manual", "CA"),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 404]);
    const { SUPPORT_ENDORSEMENT_BUMP } = await import("./elections/engine/electionFormulaFactors");
    expect((await db.collection("electionCandidates").findOne({ _id: candidateId }))!.support).toBe(
      50 - SUPPORT_ENDORSEMENT_BUMP
    );
  });
  it("expires one hundred executive orders using a fixed number of database commands", async () => {
    const orders = Array.from({ length: 100 }, (_, i) => ({
      _id: new ObjectId(),
      countryId: "US",
      stateId: `R${i}`,
      legislationTypeId: "law",
      status: "active",
      expiresAtTurn: 4,
      policyOptionIndexBefore: 1,
    }));
    await db.collection("governorExecutiveOrders").insertMany(orders);
    await db.collection("statePolicies").insertMany(
      orders.map((order) => ({
        _id: new ObjectId(),
        countryId: "US",
        stateId: order.stateId,
        legislationTypeId: "law",
        policyOptionIndex: 4,
        enactedBy: { kind: "order", id: order._id },
      }))
    );
    await db.collection<Row>("legislationTypes").insertOne({ _id: "law", policyOptions: [] });
    let commands = 0,
      requestBytes = 0,
      responseBytes = 0;
    const requests = new Set<number>();
    const started = (event: { databaseName: string; requestId: number; command: Document }) => {
      if (event.databaseName === db.databaseName) {
        commands++;
        requestBytes += BSON.serialize(event.command).byteLength;
        requests.add(event.requestId);
      }
    };
    const succeeded = (event: { requestId: number; reply: Document }) => {
      if (requests.delete(event.requestId)) responseBytes += BSON.serialize(event.reply).byteLength;
    };
    mongo!.client.on("commandStarted", started);
    mongo!.client.on("commandSucceeded", succeeded);
    let result: { expired: number; superseded: number };
    try {
      result = await processGovernorExecutiveOrders(db, 5);
    } finally {
      mongo!.client.off("commandStarted", started);
      mongo!.client.off("commandSucceeded", succeeded);
    }
    expect(result!).toEqual({ expired: 100, superseded: 0 });
    expect(commands).toBeLessThanOrEqual(7);
    console.info(
      JSON.stringify({
        profile: "governor-order-expiry-100",
        commands,
        requestBytes,
        responseBytes,
      })
    );
  });

  it("does not certify a cash debit that Mongo cannot represent in the stored balance", async () => {
    const { applyMoneyMove, resumeMoneyMove } = await import("./banking/moneyMove");
    await db.collection<Row>("precisionAccounts").insertMany([
      { _id: "source", balance: 1e18 },
      { _id: "recipient", balance: 0 },
    ]);
    const move = {
      key: "precision-noop",
      kind: "precision-test",
      legs: [
        {
          kind: "debit" as const,
          collection: "precisionAccounts",
          filter: { _id: "source" },
          path: "balance",
          amount: 1,
          note: "out",
        },
        {
          kind: "credit" as const,
          collection: "precisionAccounts",
          filter: { _id: "recipient" },
          path: "balance",
          amount: 1,
          note: "in",
        },
      ],
    };
    expect((await applyMoneyMove(db, move)).status).not.toBe("applied");
    expect((await resumeMoneyMove(db, move.key)).status).not.toBe("applied");
    expect(
      (await db.collection<Row>("precisionAccounts").findOne({ _id: "source" }))!.balance
    ).toBe(1e18);
    expect(
      (await db.collection<Row>("precisionAccounts").findOne({ _id: "recipient" }))!.balance
    ).toBe(0);
  });

  it("deletes only exact archived financial snapshots on actual Mongo", async () => {
    const collection = db.collection<Row>("retentionSnapshots");
    await collection.insertMany([
      { _id: "changed", turn: 1, amount: 100 },
      { _id: "unchanged", turn: 1, amount: 50 },
    ]);
    const snapshots = await collection.find({}).toArray();
    await collection.updateOne({ _id: "changed" }, { $set: { amount: 250 } });
    await collection.insertOne({ _id: "late", turn: 1, amount: 200 });
    const result = await collection.deleteMany(
      archivedDeletionFilter({ turn: { $lt: 10 } }, snapshots)
    );
    expect(result.deletedCount).toBe(1);
    expect((await collection.find({}).sort({ _id: 1 }).toArray()).map((row) => row._id)).toEqual([
      "changed",
      "late",
    ]);
  });

  it("commits pending IPO cash and publication once across actual concurrent transactions", async () => {
    const corpId = new ObjectId();
    await db.collection<Row>("exchangeRates").insertMany([
      { _id: "US", currencyCode: "USD", rate: 1 },
      { _id: "CA", currencyCode: "CAD", rate: 2 },
    ]);
    await db.collection<Row>("corporations").insertOne({
      _id: corpId,
      name: "Synthetic issuer",
      countryId: "CA",
      liquidCurrencyCode: "CAD",
      liquidCapital: 0,
      isPrivate: false,
      totalShares: 1000,
      publicFloat: 1,
      sharePrice: 1,
      fundamentalSharePrice: 1,
      pendingShareIssuance: {
        remainingShares: 1,
        requestedShares: 100,
        source: "ipo",
        issuedUpfront: true,
        createdAtTurn: 1,
        initialPriceLocal: 1,
      },
    });
    await db
      .collection<Row>("equityMarketPools")
      .insertOne({ _id: "CAD", cashLocal: 100000, targetCashLocal: 0, m2Local: 1000000 });
    let first = true;
    const interrupted = intercept(db, "corporations", "updateOne", async (_args, run) => {
      const result = await run();
      if (first) {
        first = false;
        throw new Error("lost primary publication acknowledgement");
      }
      return result;
    });
    await expect(placePendingShareIssuances(interrupted, 5, new Date())).rejects.toThrow(
      "lost primary"
    );
    expect((await db.collection<Row>("equityMarketPools").findOne({ _id: "CAD" }))!.cashLocal).toBe(
      100000
    );
    await Promise.all([
      placePendingShareIssuances(db, 5, new Date()),
      placePendingShareIssuances(db, 5, new Date()),
    ]);
    const issuer = await db.collection<Row>("corporations").findOne({ _id: corpId });
    const pool = await db.collection<Row>("equityMarketPools").findOne({ _id: "CAD" });
    expect(issuer!.liquidCapital).toBeGreaterThan(0);
    expect(issuer!.totalShares).toBe(1000);
    expect(issuer!.publicFloat).toBe(1);
    expect(Number(issuer!.liquidCapital) + Number(pool!.cashLocal)).toBeCloseTo(100000, 8);
    expect(await db.collection("shareTradeHistory").countDocuments({ corporationId: corpId })).toBe(
      1
    );
  });

  it("batches weighted sovereign ballots once across actual competing transactions", async () => {
    const nppId = new ObjectId(),
      decisionId = new ObjectId();
    const decision = {
      _id: decisionId,
      countryCode: "US",
      state: "executiveProposed",
      executiveChoice: "bailout",
      currentChamberIndex: 0,
      legislativePhases: [
        { chamberKey: "house", outcome: "pending", votes: {}, votesFor: 0, votesAgainst: 0 },
      ],
    };
    await db.collection<Row>("sovereignCrisisDecisions").insertOne(decision);
    await db.collection<Row>("npps").insertOne({
      _id: nppId,
      countryId: "US",
      retiredAt: null,
      policies: { economic: 5, social: 0 },
      personality: { loyalty: 80 },
    });
    await db.collection<Row>("electedOfficials").insertOne({
      _id: new ObjectId(),
      countryId: "US",
      officeType: "house",
      nppId,
      isNPP: true,
      seatsHeld: 20,
    });
    const input = {
      decision:
        decision as unknown as import("./db/types/sovereignCrisisDecision").SovereignCrisisDecision,
      chamberIndex: 0,
      countryCode: "US" as const,
    };
    const results = await Promise.all([
      runNpcLegislatorAutoVote(db, input),
      runNpcLegislatorAutoVote(db, input),
    ]);
    expect(results.reduce((sum, result) => sum + result.npcsVoted, 0)).toBe(1);
    expect(
      (await db.collection<Row>("sovereignCrisisDecisions").findOne({ _id: decisionId }))!
        .legislativePhases[0]
    ).toMatchObject({ votesFor: 20, votesAgainst: 0 });
  });

  it("rejects finalized and stale cumulative tally generations on actual Mongo", async () => {
    const electionId = new ObjectId();
    await db.collection<Row>("electionVoteTallies").insertOne({
      _id: new ObjectId(),
      electionId,
      finalized: false,
      totalVotes: { a: 100 },
      turnSnapshots: [],
    });
    const stale = tallyPublicationFilter({
      electionId,
      totalVotes: { a: 100 },
      snapshots: [],
      turn: 5,
    });
    await db
      .collection("electionVoteTallies")
      .updateOne({ electionId }, { $set: { totalVotes: { a: 200 } } });
    expect(
      (
        await db
          .collection("electionVoteTallies")
          .updateOne(stale, { $set: { totalVotes: { a: 150 } } })
      ).matchedCount
    ).toBe(0);
    await db
      .collection("electionVoteTallies")
      .updateOne({ electionId }, { $set: { totalVotes: { a: 100 }, finalized: true } });
    expect(
      (
        await db
          .collection("electionVoteTallies")
          .updateOne(stale, { $set: { totalVotes: { a: 150 } } })
      ).matchedCount
    ).toBe(0);
  });
  it("keeps one immutable settled history row when two publishers race", async () => {
    const corporationId = new ObjectId();
    const row = corporationHistoryFixture(corporationId, 100);
    await Promise.all([
      publishCorporateTurnHistory(db, [row]),
      publishCorporateTurnHistory(db, [{ ...row, income: 20 }]),
    ]);
    const saved = await db
      .collection("corporationHistory")
      .find({ corporationId, turn: 100 })
      .toArray();
    expect(saved).toHaveLength(1);
    const original = saved[0].income;
    expect([10, 20]).toContain(original);
    await publishCorporateTurnHistory(db, [{ ...row, income: 30 }]);
    expect(
      (await db.collection("corporationHistory").findOne({ corporationId, turn: 100 }))?.income
    ).toBe(original);
  });

  it("rolls back GDP and macro rows after an acknowledged state bulk, then freezes the completed turn", async () => {
    await db
      .collection<Row>("gameState")
      .updateOne({ _id: "current" }, { $set: { preset: "2019-default" } });
    await db.collection<Row>("states").insertOne({
      _id: "TX",
      countryId: "US",
      name: "Fixture",
      population: 100000,
      workingAgePopulation: 70000,
      militaryServicePopulation: 0,
      gdp: 1000,
    });
    await db.collection<Row>("macroMetrics").insertOne({
      _id: "TX",
      countryId: "US",
      economic: {
        gdpGrowth: { value: 2 },
        sectorGrowth: { value: 2 },
        unemploymentRate: { value: 5 },
      },
    });
    await db.collection<Row>("federalBudget").insertOne({
      _id: "federal",
      countryId: "US",
      gdp: 1000000000,
      gdpSmoothed: 1000000000,
      priceIndex: 1,
      taxRates: { salesTax: 0 },
    });
    const before = await db.collection<Row>("macroMetrics").findOne({ _id: "TX" });
    let crashed = false;
    const faulty = intercept(db, "states", "bulkWrite", async (_args, run) => {
      const result = await run();
      if (!crashed) {
        crashed = true;
        throw new Error("lost state acknowledgement");
      }
      return result;
    });
    await expect(runMetricEngine(faulty, 101)).rejects.toThrow("lost state acknowledgement");
    expect(crashed).toBe(true);
    expect((await db.collection<Row>("states").findOne({ _id: "TX" }))?.gdp).toBe(1000);
    expect(await db.collection<Row>("macroMetrics").findOne({ _id: "TX" })).toEqual(before);
    expect(await runMetricEngine(db, 101)).toBe(1);
    const after = await db.collection<Row>("states").findOne({ _id: "TX" });
    expect(await runMetricEngine(db, 101)).toBe(1);
    expect(await db.collection<Row>("states").findOne({ _id: "TX" })).toEqual(after);
  });
  it("retains an independent opening depletion counter after a landed bulk is retried", async () => {
    await db.collection("stateResourceCapacity").insertOne({
      stateId: "TX",
      countryId: "US",
      resources: { oil: 100 },
      extractedUnits: { oil: 30 },
    });
    const input = [
      { sectorId: "one", stateId: "TX", revenueBasedOutput: { oil: 20 } },
    ] as ExtractionSectorInput[];
    let crashed = false;
    const faulty = intercept(db, "stateResourceCapacity", "bulkWrite", async (_args, run) => {
      const result = await run();
      if (!crashed) {
        crashed = true;
        throw new Error("lost depletion acknowledgement");
      }
      return result;
    });
    await expect(
      bookExtractionDepletion(faulty, input, new Map(), new Date(), 101)
    ).rejects.toThrow();
    await bookExtractionDepletion(db, input, new Map(), new Date(), 101);
    expect(await db.collection("stateResourceCapacity").findOne({ stateId: "TX" })).toMatchObject({
      extractedUnits: { oil: 50 },
      extractionOpeningUnits: { oil: 30 },
      extractionDepletionTurn: 101,
    });
  });
  it("commits a raced corporate vote once with its governance effect", async () => {
    const corporationId = new ObjectId(),
      holder = new ObjectId();
    await db.collection("corporations").insertOne({
      _id: corporationId,
      countryId: "US",
      totalShares: 100,
      shareholders: [{ characterId: holder, shares: 100 }],
      legalStructure: "us_c_corp",
    });
    const vote = {
      _id: new ObjectId(),
      corporationId,
      type: "governance_change",
      proposedByCharacterId: holder,
      proposedAtTurn: 100,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      status: "open",
      totalEligibleSharesAtOpen: 100,
      deadlineAtTurn: 110,
      passThreshold: 0.5,
      votes: [{ characterId: holder, vote: "yes", voteShares: 60, castAt: new Date(0) }],
      payload: { newLegalStructure: "us_llc" },
    } as CorporationVote;
    await db.collection("corporationVotes").insertOne({ ...vote });
    const run = () =>
      resolveCorporationVoteIfReady({ db, vote, totalEligibleShares: 100, currentTurn: 100 });
    const results = await Promise.all([run(), run()]);
    expect(results.filter((result) => result.claimed)).toHaveLength(1);
    expect((await db.collection("corporationVotes").findOne({ _id: vote._id }))?.status).toBe(
      "passed"
    );
    expect(
      (await db.collection("corporations").findOne({ _id: corporationId }))?.legalStructure
    ).toBe("us_llc");
  });
  async function partyResourceFixture() {
    await db.collection("politicalParties").insertOne({
      countryId: "US",
      sequentialId: 1,
      tier: "major",
      politicalStrength: 20,
      nppActionPoints: 0,
      treasury: 1000000,
      psInvestmentBudget: 25000,
    });
    await db.collection("statePartyOrg").insertOne({
      _id: "TX_1",
      countryId: "US",
      stateId: "TX",
      partyId: "1",
      organization: 40,
      registration: 20,
      politicalStrength: 20,
      nppActionPoints: 0,
      treasury: 1000000,
    } as never);
    await db.collection("stateRegistrationPool").insertOne({
      _id: "US_TX",
      countryId: "US",
      stateId: "TX",
      independent: 50,
      unregistered: 30,
      lastUpdatedTurn: 4,
    } as never);
  }
  it("party resource races buy strength once and keep registration totals conserved", async () => {
    await partyResourceFixture();
    const now = new Date();
    await Promise.all([
      processPartyActionGeneration(now, db, 5),
      processPartyActionGeneration(now, db, 5),
    ]);
    expect((await db.collection("politicalParties").findOne({ sequentialId: 1 }))!.treasury).toBe(
      975000
    );
    expect(await db.collection("treasuryTransactions").countDocuments()).toBe(1);
    await Promise.all([processRegDriftDecay(5, now, db), processRegDriftDecay(5, now, db)]);
    const party = await db.collection("statePartyOrg").findOne({ stateId: "TX" });
    const pool = await db.collection("stateRegistrationPool").findOne({ stateId: "TX" });
    expect(party!.registration + pool!.independent + pool!.unregistered).toBeCloseTo(100, 9);
  });
  it("party resource publication rolls back when the final receipt acknowledgement fails", async () => {
    await partyResourceFixture();
    let reached = false;
    const fault = intercept(db, "bankMoneyMoves", "insertOne", async (_args, run) => {
      const result = await run();
      if (!reached) {
        reached = true;
        throw new Error("Lost party receipt acknowledgement");
      }
      return result;
    });
    await expect(processPartyActionGeneration(new Date(), fault, 5)).rejects.toThrow(
      "Lost party receipt acknowledgement"
    );
    expect(reached).toBe(true);
    expect((await db.collection("politicalParties").findOne({ sequentialId: 1 }))!.treasury).toBe(
      1000000
    );
    expect(await db.collection("treasuryTransactions").countDocuments()).toBe(0);
    await processPartyActionGeneration(new Date(), fault, 5);
    expect((await db.collection("politicalParties").findOne({ sequentialId: 1 }))!.treasury).toBe(
      975000
    );
  });
  it("campaign initialization races share one funded ledger and preserve a legacy ledger", async () => {
    const args = {
      db,
      electionId: new ObjectId(),
      candidateId: new ObjectId(),
      candidateIsNPP: false,
      party: "1",
    };
    const ids = await Promise.all(Array.from({ length: 8 }, () => createInitialCampaign(args)));
    expect(new Set(ids.map((id) => id.toHexString())).size).toBe(1);
    await db.collection("campaigns").updateOne({ _id: ids[0] }, { $inc: { funds: 500 } });
    expect(await createInitialCampaign(args)).toEqual(ids[0]);
    expect((await db.collection("campaigns").findOne({ _id: ids[0] }))!.funds).toBe(500);
    expect(await db.collection("campaigns").countDocuments()).toBe(1);
    const legacy = new ObjectId(),
      electionId = new ObjectId();
    await db.collection("campaigns").insertOne({
      _id: legacy,
      electionId,
      candidateId: args.candidateId,
      funds: 700,
      status: "active",
    });
    expect(await createInitialCampaign({ ...args, electionId })).toEqual(legacy);
  });
});
