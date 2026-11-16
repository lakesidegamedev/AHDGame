import { transferFinancialHoldings } from "./transferFinancialHoldings";
import { transferCorporateArrears } from "./transferCorporateArrears";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { consolidateStateCash } from "./consolidateStateCash";
import { resetCorpFxRateCacheForTests } from "@/lib/currency/corporationCapital";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import {
  startIsolatedMongod,
  stopIsolatedMongod,
  sleep,
  REAL_MONGO_ENABLED,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { ensureNationalizationSiteIndex } from "@/lib/migrations/entries/2026-11-16-nationalization-site-identity";
import { transferFundedSite } from "./fundedSiteTransfer";
import { producerPayableId } from "@/lib/market/producerMarket/payablesRules";
import {
  splitFundedInventory,
  producerDebtAnchor,
  producerStockBookAnchor,
} from "./rules/fundedOwnership";

describe.skipIf(!REAL_MONGO_ENABLED)("funded ownership on an owned replica set", () => {
  let handle: IsolatedMongod;
  const fromId = new ObjectId(),
    toId = new ObjectId(),
    siteId = new ObjectId();
  beforeAll(async () => {
    handle = await startIsolatedMongod("ahd-natcorp-", { replicaSet: "natcorp" });
    await handle.client.db("admin").command({
      replSetInitiate: { _id: "natcorp", members: [{ _id: 0, host: new URL(handle.uri).host }] },
    });
    const deadline = Date.now() + 20_000;
    while (!(await handle.client.db("admin").command({ hello: 1 })).isWritablePrimary) {
      if (Date.now() > deadline) throw new Error("Owned replica set did not elect a primary");
      await sleep(100);
    }
  }, 40_000);
  afterAll(async () => {
    await stopIsolatedMongod(handle);
  }, 25_000);
  beforeEach(async () => {
    await handle.db.dropDatabase();
    resetCorpFxRateCacheForTests();
    await corporationsCollection(handle.db).insertMany([
      { _id: fromId, liquidCapital: 12345.67, liquidCurrencyCode: "CAD" },
      { _id: toId, liquidCapital: 9876543210.12, liquidCurrencyCode: "USD" },
    ] as never[]);
    const claim = {
      debtorAccountId: fromId.toHexString(),
      creditorAccountId: "workers:CA",
      producerId: siteId.toHexString(),
      kind: "labour" as const,
      amount: 125,
      notShrinkingSince: 1,
    };
    await corporationsCollection(handle.db).updateOne(
      { _id: fromId },
      {
        $set: {
          producerPayables: {
            worldEpoch: "world",
            turn: 2,
            claims: [{ ...claim, id: producerPayableId(claim) }],
          },
        },
      }
    );
    await corporateSectorsCollection(handle.db).insertOne({
      _id: siteId,
      corporationId: fromId,
      countryId: "CA",
      stateId: "CA_ON",
      sectorType: "energy",
      strategyId: "hydroelectric",
      capitalStock: 100,
      capacityBookAnchor: 2000,
      buildQueue: [],
      producerCapacity: { worldEpoch: "world", turn: 2 },
      producerInventory: {
        worldEpoch: "world",
        turn: 2,
        inputStock: [{ commodity: "steel", units: 10, value: 100 }],
        outputStock: [{ commodity: "energy", units: 20, book: "country:CA", quoteUnitCost: 3 }],
      },
    } as never);
    await corporateSectorsCollection(handle.db).createIndex(
      { corporationId: 1, stateId: 1, sectorType: 1 },
      { unique: true, name: "old-identity" }
    );
    await ensureNationalizationSiteIndex(handle.db);
  });
  it("preserves methods, funded inventory, liabilities and mixed-currency cash on full acquisition and replay", async () => {
    const sectors = corporateSectorsCollection(handle.db),
      corps = corporationsCollection(handle.db);
    await sectors.insertOne({
      _id: new ObjectId(),
      corporationId: toId,
      stateId: "CA_ON",
      sectorType: "energy",
      strategyId: "gas_fired",
    } as never);
    const source = (await sectors.findOne({ _id: siteId }))!;
    const input = {
      source,
      toId,
      key: "take:2",
      fraction: 1,
      acquired: { capitalStock: 85, capacityBookAnchor: 1700 },
    };
    await transferFundedSite(handle.db, input);
    const once = await sectors.findOne({ _id: siteId });
    await transferFundedSite(handle.db, input);
    expect(await sectors.findOne({ _id: siteId })).toEqual(once);
    expect(once?.strategyId).toBe("hydroelectric");
    expect(once?.producerInventory).toEqual(source.producerInventory);
    expect(await sectors.countDocuments({ corporationId: toId })).toBe(2);
    expect(producerDebtAnchor((await corps.findOne({ _id: fromId }))?.producerPayables)).toBe(0);
    expect(producerDebtAnchor((await corps.findOne({ _id: toId }))?.producerPayables)).toBe(125);
    expect((await corps.findOne({ _id: fromId }))?.liquidCapital).toBe(12345.67);
    expect((await corps.findOne({ _id: toId }))?.liquidCapital).toBe(9876543210.12);
  });
  it("conserves partial stock and bills, and keeps private uniqueness", async () => {
    const sectors = corporateSectorsCollection(handle.db),
      corps = corporationsCollection(handle.db);
    const source = (await sectors.findOne({ _id: siteId }))!;
    const inventory = splitFundedInventory(source.producerInventory!, 0.4);
    const input = {
      source,
      toId,
      key: "privatize:2",
      fraction: 0.4,
      privateTarget: true,
      acquired: { capitalStock: 40, producerInventory: inventory.moved },
      retained: { capitalStock: 60, producerInventory: inventory.kept },
    };
    const movedId = await transferFundedSite(handle.db, input);
    expect(await transferFundedSite(handle.db, input)).toEqual(movedId);
    const moved = (await sectors.findOne({ _id: movedId }))!,
      kept = (await sectors.findOne({ _id: siteId }))!;
    expect(moved.nationalizationSiteKey).toBeUndefined();
    expect(moved.strategyId).toBe("hydroelectric");
    expect(
      producerStockBookAnchor(moved.producerInventory) +
        producerStockBookAnchor(kept.producerInventory)
    ).toBe(160);
    expect(
      producerDebtAnchor((await corps.findOne({ _id: fromId }))?.producerPayables) +
        producerDebtAnchor((await corps.findOne({ _id: toId }))?.producerPayables)
    ).toBe(125);
    await expect(sectors.insertOne({ ...moved, _id: new ObjectId() })).rejects.toThrow();
  });
  it("conserves mixed-currency residual cash and does not duplicate it on merge replay", async () => {
    await handle.db.collection("exchangeRates").insertMany([
      { currencyCode: "CAD", rate: 2 },
      { currencyCode: "USD", rate: 1 },
    ]);
    const coll = corporationsCollection(handle.db);
    const original = 12345.67 / 2 + 9876543210.12;
    await consolidateStateCash(handle.db, fromId, toId);
    expect((await coll.findOne({ _id: fromId }))?.liquidCapital).toBe(0);
    expect((await coll.findOne({ _id: toId }))?.liquidCapital).toBeCloseTo(original, 4);
    await consolidateStateCash(handle.db, fromId, toId);
    expect((await coll.findOne({ _id: toId }))?.liquidCapital).toBeCloseTo(original, 4);
  });
  it("refuses a stale build quote without overwriting paid construction", async () => {
    const coll = corporateSectorsCollection(handle.db);
    const source = (await coll.findOne({ _id: siteId }))!;
    const queue = [{ unitsOrdered: 10, costPaidAnchor: 999, startTurn: 2, onlineTurn: 6 }];
    await coll.updateOne({ _id: siteId }, { $set: { buildQueue: queue } });
    await expect(
      transferFundedSite(handle.db, { source, toId, key: "stale", fraction: 1, acquired: {} })
    ).rejects.toThrow(/changed/);
    expect((await coll.findOne({ _id: siteId }))?.buildQueue).toEqual(queue);
    expect((await coll.findOne({ _id: siteId }))?.corporationId).toEqual(fromId);
  });

  it("transfers share and bond portfolios at their existing basis without cash and survives replay", async () => {
    const corps = corporationsCollection(handle.db),
      bonds = bondsCollection(handle.db);
    const issuerId = new ObjectId(),
      bondId = new ObjectId();
    await handle.db.collection("exchangeRates").insertMany([
      { currencyCode: "CAD", rate: 2 },
      { currencyCode: "USD", rate: 1 },
    ]);
    await corps.insertOne({
      _id: issuerId,
      countryId: "CA",
      liquidCurrencyCode: "CAD",
      shareholders: [
        { corporationId: fromId, shares: 100, avgCostPerShare: 20, superShares: 50 },
        { corporationId: toId, shares: 300, avgCostPerShare: 5, avgCostBasisUnit: "anchor" },
      ],
    } as never);
    await bonds.insertOne({
      _id: bondId,
      matured: false,
      holders: [
        { corporationId: fromId, units: 10, avgCostPerUnit: 1000 },
        { corporationId: toId, units: 20, avgCostPerUnit: 2000 },
      ],
    } as never);
    await transferFinancialHoldings(handle.db, fromId, toId, new Date(0), { dryRun: true });
    expect((await corps.findOne({ _id: issuerId }))?.shareholders).toHaveLength(2);
    await transferFinancialHoldings(handle.db, fromId, toId, new Date(0));
    const once = await corps.findOne({ _id: issuerId }),
      bond = await bonds.findOne({ _id: bondId });
    expect(once?.shareholders).toEqual([
      {
        corporationId: toId,
        shares: 400,
        avgCostPerShare: 6.25,
        avgCostBasisUnit: "anchor",
        superShares: 50,
      },
    ]);
    expect(bond?.holders).toHaveLength(1);
    expect(bond?.holders[0].units).toBe(30);
    expect(bond!.holders[0].units * bond!.holders[0].avgCostPerUnit!).toBeCloseTo(50000, 8);
    await transferFinancialHoldings(handle.db, fromId, toId, new Date(0));
    expect(await corps.findOne({ _id: issuerId })).toEqual(once);
    expect(await bonds.findOne({ _id: bondId })).toEqual(bond);
    expect((await corps.findOne({ _id: fromId }))?.liquidCapital).toBe(12345.67);
    expect((await corps.findOne({ _id: toId }))?.liquidCapital).toBe(9876543210.12);
  });

  it("conserves denomination-specific operating and tax arrears through novation and retry", async () => {
    const corps = corporationsCollection(handle.db);
    await corps.updateOne(
      { _id: fromId },
      {
        $set: {
          operatingCashArrearsByCurrency: { CAD: 100, USD: 20 },
          federalTaxArrearsAnchorByCountry: { CA: 7 },
        },
      }
    );
    await corps.updateOne(
      { _id: toId },
      {
        $set: {
          operatingCashArrearsByCurrency: { CAD: 11, USD: 5 },
          federalTaxArrearsAnchorByCountry: { US: 9 },
        },
      }
    );
    await transferCorporateArrears(handle.db, fromId, toId);
    const once = await corps.findOne({ _id: toId });
    expect(once?.operatingCashArrearsByCurrency).toEqual({ CAD: 111, USD: 25 });
    expect(once?.federalTaxArrearsAnchorByCountry).toEqual({ CA: 7, US: 9 });
    expect((await corps.findOne({ _id: fromId }))?.operatingCashArrearsByCurrency).toBeUndefined();
    await transferCorporateArrears(handle.db, fromId, toId);
    expect(await corps.findOne({ _id: toId })).toEqual(once);
  });

  it("rolls back all portfolio writes when a later bond write fails", async () => {
    const corps = corporationsCollection(handle.db),
      bonds = bondsCollection(handle.db);
    const issuerId = new ObjectId(),
      bondId = new ObjectId();
    await corps.insertOne({
      _id: issuerId,
      shareholders: [{ corporationId: fromId, shares: 100 }],
    } as never);
    await bonds.insertOne({
      _id: bondId,
      matured: false,
      holders: [{ corporationId: fromId, units: 10 }],
    } as never);
    const stock = await corps.findOne({ _id: issuerId }),
      debt = await bonds.findOne({ _id: bondId });
    await handle.db.command({ collMod: "bonds", validator: { "holders.corporationId": fromId } });
    await expect(transferFinancialHoldings(handle.db, fromId, toId, new Date(0))).rejects.toThrow();
    expect(await corps.findOne({ _id: issuerId })).toEqual(stock);
    expect(await bonds.findOne({ _id: bondId })).toEqual(debt);
  });

  it("rolls back physical ownership and creditor writes when the successor rejects a liability", async () => {
    const corps = corporationsCollection(handle.db),
      sectors = corporateSectorsCollection(handle.db);
    const source = (await sectors.findOne({ _id: siteId }))!;
    const original = await corps.find({}).sort({ _id: 1 }).toArray();
    await handle.db.command({
      collMod: "corporations",
      validator: { $or: [{ _id: { $ne: toId } }, { producerPayables: { $exists: false } }] },
    });
    await expect(
      transferFundedSite(handle.db, {
        source,
        toId,
        key: "failure",
        fraction: 1,
        acquired: { capitalStock: 85 },
      })
    ).rejects.toThrow();
    expect(await sectors.findOne({ _id: siteId })).toEqual(source);
    expect(await corps.find({}).sort({ _id: 1 }).toArray()).toEqual(original);
  });
});
