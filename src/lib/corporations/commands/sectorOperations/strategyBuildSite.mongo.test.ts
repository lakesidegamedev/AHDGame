import { convertCorpCurrency } from "@/lib/corporations/convertCorpCurrency";
import { sellFundBondHoldingsForCash } from "@/lib/bonds/sellFundBondUnits";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Corporation, CorporateSector, SectorBuildOrder } from "@/lib/db/types";
import { getMongoClient } from "@/lib/mongodb";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { ensureNationalizationSiteIndex } from "@/lib/migrations/entries/2026-11-16-nationalization-site-identity";
import {
  REAL_MONGO_ENABLED,
  sleep,
  startIsolatedMongod,
  stopIsolatedMongod,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import { commitSiteCashMutation } from "@/lib/corporations/siteCashMutation";
import { placeStrategyBuildSite, strategyBuildSiteIdentity } from "./strategyBuildSite";

vi.mock("@/lib/mongodb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mongodb")>()),
  getMongoClient: vi.fn(),
}));

describe.skipIf(!REAL_MONGO_ENABLED)("strategy builds on an isolated replica set", () => {
  let handle: IsolatedMongod;

  beforeAll(async () => {
    handle = await startIsolatedMongod("ahd-strategy-build-", { replicaSet: "strategy-build" });
    await handle.client.db("admin").command({
      replSetInitiate: {
        _id: "strategy-build",
        members: [{ _id: 0, host: new URL(handle.uri).host }],
      },
    });
    const deadline = Date.now() + 20_000;
    while (!(await handle.client.db("admin").command({ hello: 1 })).isWritablePrimary) {
      if (Date.now() > deadline) throw new Error("Test replica set did not elect a primary");
      await sleep(100);
    }
    vi.mocked(getMongoClient).mockResolvedValue(handle.client);
    await ensureNationalizationSiteIndex(handle.db);
    await handle.db
      .collection("gameState")
      .insertOne({ _id: "current" as never, isProcessing: false });
  }, 40_000);

  afterAll(async () => {
    await stopIsolatedMongod(handle);
  }, 25_000);

  it("charges once for a retried build and keeps the original site and queue", async () => {
    const corporationId = new ObjectId();
    const sectors = corporateSectorsCollection(handle.db);
    const corporations = corporationsCollection(handle.db);
    const now = new Date();
    const order: SectorBuildOrder = {
      unitsOrdered: 80,
      strategyId: "hardware",
      costPaidAnchor: 1000,
      startTurn: 64,
      onlineTurn: 80,
    };
    const original: CorporateSector = {
      _id: new ObjectId(),
      corporationId,
      countryId: "US",
      stateId: "CA",
      sectorType: "technology",
      strategyId: "standard",
      targetGrowthRate: 0,
      currentGrowthRate: 0,
      currentGrowthCost: 0,
      revenue: 100,
      profitMargin: 10,
      workers: 100,
      capitalStock: 800,
      buildQueue: [{ ...order, strategyId: "standard" }],
      createdAt: now,
      updatedAt: now,
    };
    await sectors.insertOne(original);
    await corporations.insertOne({ _id: corporationId, liquidCapital: 1500 } as never);
    const site: CorporateSector = {
      ...original,
      ...strategyBuildSiteIdentity(corporationId, "site-1"),
      strategyId: "hardware",
      workers: 0,
      capitalStock: 0,
      buildQueue: [],
    };
    const attempts = await Promise.all([
      placeStrategyBuildSite(handle.db, site, order, 1000),
      placeStrategyBuildSite(handle.db, site, order, 1000),
    ]);

    expect(attempts.sort()).toEqual(["created", "existing"]);
    expect(await sectors.findOne({ _id: original._id })).toEqual(original);
    expect(await sectors.findOne({ _id: site._id })).toMatchObject({
      stateId: original.stateId,
      strategyId: "hardware",
      buildQueue: [order],
    });
    expect(await corporations.findOne({ _id: corporationId })).toMatchObject({
      liquidCapital: 500,
    });

    const anotherSite = { ...site, ...strategyBuildSiteIdentity(corporationId, "site-2") };
    await expect(placeStrategyBuildSite(handle.db, anotherSite, order, 1000)).resolves.toBe(
      "insufficient_cash"
    );
    expect(await sectors.findOne({ _id: anotherSite._id })).toBeNull();
  }, 20_000);
  it("aborts cash and property when a receipt is interrupted, and safely retries", async () => {
    const corp = {
      _id: new ObjectId(),
      liquidCapital: 1e12,
      liquidCurrencyCode: "CAD",
    } as Corporation;
    const siteId = new ObjectId();
    await corporationsCollection(handle.db).insertOne(corp);
    await corporateSectorsCollection(handle.db).insertOne({
      _id: siteId,
      corporationId: corp._id,
      buildQueue: [],
    } as never);
    const input = {
      corporation: corp,
      chargeLocal: 123456789.12,
      now: new Date(),
      site: {
        filter: { _id: siteId, buildQueue: [] },
        update: { $set: { buildQueue: [{ unitsOrdered: 2 }] } },
      },
    };
    await expect(
      commitSiteCashMutation(handle.db, {
        ...input,
        record: async () => {
          throw new Error("injected receipt interruption");
        },
      })
    ).rejects.toThrow("injected receipt interruption");
    expect(
      (await corporationsCollection(handle.db).findOne({ _id: corp._id }))?.liquidCapital
    ).toBe(1e12);
    expect(
      (await corporateSectorsCollection(handle.db).findOne({ _id: siteId }))?.buildQueue
    ).toEqual([]);
    const races = await Promise.all([
      commitSiteCashMutation(handle.db, input),
      commitSiteCashMutation(handle.db, input),
    ]);
    expect(races.sort()).toEqual([false, true]);
    expect(
      (await corporationsCollection(handle.db).findOne({ _id: corp._id }))?.liquidCapital
    ).toBe(1e12 - 123456789.12);
  });
  it("retains every treasury budget and refuses a stale conversion snapshot", async () => {
    const corp = {
      _id: new ObjectId(),
      liquidCurrencyCode: "CAD",
      countryId: "CA",
      liquidCapital: 10000,
      sharePrice: 4,
      marketingBudget: 10,
      logisticsBudget: 20,
      ceoSalary: 30,
      rdBudget: 40,
      shareEscrowBalance: 50,
      escrowFundingPerTurn: 60,
    } as Corporation;
    await corporationsCollection(handle.db).insertOne(corp);
    const rates = new Map([
      ["CAD", 2],
      ["USD", 1],
    ] as const);
    await corporationsCollection(handle.db).updateOne(
      { _id: corp._id },
      { $inc: { liquidCapital: 100 } }
    );
    const stale = await convertCorpCurrency(handle.db, corp, "USD", rates, new Date(), true, []);
    expect(stale.ok).toBe(false);
    const fresh = await corporationsCollection(handle.db).findOne({ _id: corp._id });
    const result = await convertCorpCurrency(handle.db, fresh!, "USD", rates, new Date(), true, []);
    expect(result.ok).toBe(true);
    expect(await corporationsCollection(handle.db).findOne({ _id: corp._id })).toMatchObject({
      liquidCapital: 5050,
      rdBudget: 20,
      shareEscrowBalance: 25,
      escrowFundingPerTurn: 30,
      liquidCurrencyCode: "USD",
    });
  });
  it("settles a raced fund sale once with conserved native and anchor cash", async () => {
    const fund = {
      _id: new ObjectId(),
      name: "Replica fund",
      quotedNav: 100,
      anchorCurrencyCode: "USD" as const,
    };
    await handle.db.collection("exchangeRates").insertOne({ currencyCode: "GBP", rate: 2 });
    await handle.db.collection("indexFunds").insertOne({ ...fund, cashAnchor: 0 });
    await handle.db
      .collection("bondMarketPools")
      .insertOne({ _id: "GBP" as never, cashLocal: 1e9, targetCashLocal: 1e9 });
    const bondId = new ObjectId();
    await handle.db.collection("bonds").insertOne({
      _id: bondId,
      currencyCode: "GBP",
      marketPrice: 1,
      matured: false,
      publicFloat: 0,
      holders: [{ fundId: fund._id, units: 100 }],
    });
    const now = new Date();
    await Promise.all(
      [1, 2].map(() =>
        sellFundBondHoldingsForCash(handle.db, fund, 1000, now, { operationKey: "same-redemption" })
      )
    );
    const cash = (await handle.db.collection("indexFunds").findOne({ _id: fund._id }))!.cashAnchor;
    const pool = (await handle.db.collection("bondMarketPools").findOne({ _id: "GBP" as never }))!
      .cashLocal;
    expect(cash).toBeGreaterThan(0);
    expect(pool / 2 + cash).toBeCloseTo(5e8, 6);
    expect(
      await handle.db.collection("indexFundTransactions").countDocuments({ fundId: fund._id })
    ).toBe(1);
    const sold =
      100 - (await handle.db.collection("bonds").findOne({ _id: bondId }))!.holders[0].units;
    expect(sold).toBeGreaterThan(0);
  });
  it("serializes a turn claim after an in-flight site purchase", async () => {
    const corp = {
      _id: new ObjectId(),
      liquidCapital: 1000,
      liquidCurrencyCode: "USD",
    } as Corporation;
    const siteId = new ObjectId();
    await corporationsCollection(handle.db).insertOne(corp);
    let reached!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const buying = commitSiteCashMutation(handle.db, {
      corporation: corp,
      chargeLocal: 100,
      now: new Date(),
      site: { insert: { _id: siteId, corporationId: corp._id } },
      record: async () => {
        reached();
        await gate;
      },
    });
    await ready;
    const claiming = handle.db
      .collection("gameState")
      .updateOne(
        { _id: "current" as never, isProcessing: { $ne: true } },
        { $set: { isProcessing: true } }
      );
    release();
    expect(await buying).toBe(true);
    expect((await claiming).matchedCount).toBe(1);
    expect(
      (await corporationsCollection(handle.db).findOne({ _id: corp._id }))?.liquidCapital
    ).toBe(900);
    expect(
      await commitSiteCashMutation(handle.db, {
        corporation: corp,
        chargeLocal: 100,
        now: new Date(),
        site: { insert: { _id: new ObjectId(), corporationId: corp._id } },
      })
    ).toBe(false);
    await handle.db
      .collection("gameState")
      .updateOne({ _id: "current" as never }, { $set: { isProcessing: false } });
  });
});
