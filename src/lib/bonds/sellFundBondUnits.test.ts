import { isForexEnabled } from "@/lib/currency/featureFlag";
import { loadFxRatesRecord } from "@/lib/currency/corporationCapital";
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/db/sessionDb", () => ({
  withSessionDb: async (db: Db, work: (tx: Db) => Promise<unknown>) => work(db),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/currency/corporationCapital", () => ({
  corpCapitalToAnchor: vi.fn((amount: number, _c: string, rate: number) => amount / rate),
  loadFxRatesRecord: vi.fn().mockResolvedValue({ USD: 1, GBP: 2 }),
}));
vi.mock("@/lib/bonds/marketPool", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bonds/marketPool")>();
  return { ...actual, loadBondQuote: vi.fn() };
});
vi.mock("@/lib/indexFunds/fundQueries", () => ({
  insertFundTransaction: vi.fn().mockResolvedValue(new ObjectId()),
}));
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTx: vi.fn().mockResolvedValue(undefined),
  loadTxThresholds: vi.fn().mockResolvedValue({}),
}));

import { loadBondQuote } from "@/lib/bonds/marketPool";

import { emitTx, loadTxThresholds } from "@/lib/financialTxLog/emit";
import { sellFundBondHoldingsForCash } from "./sellFundBondUnits";

let db: MockDb;
const fundId = new ObjectId();
const fund = { _id: fundId, name: "Bond Fund", quotedNav: 100, anchorCurrencyCode: "USD" as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isForexEnabled).mockResolvedValue(true);
  vi.mocked(loadFxRatesRecord).mockResolvedValue({ USD: 1, GBP: 2 });
  db = createMockDb();
  db.collection("bonds");
  db.collection("bondMarketPools");
  db.collection("indexFunds");
  db.collection("indexFundTransactions");
  db.collectionMocks.bonds.findOne.mockResolvedValue({ _id: new ObjectId() });
  db.collectionMocks.indexFunds.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
});

describe("sellFundBondHoldingsForCash", () => {
  it.each([100, 7])("an infinite need sells all held units up to depth %i", async (depth) => {
    const bonds = [10, 20].map((units) => ({
      _id: new ObjectId(),
      currencyCode: "USD",
      marketPrice: 1,
      holders: [{ fundId, units }],
    }));
    db.collectionMocks.bonds.find.mockReturnValue({ toArray: async () => bonds });
    vi.mocked(loadBondQuote).mockResolvedValue({
      bidPerUnit: 980,
      depthUnitsAtBid: depth,
    } as never);
    db.collectionMocks.bondMarketPools.findOneAndUpdate.mockResolvedValue({ cashLocal: 1 });
    db.collectionMocks.bonds.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    const result = await sellFundBondHoldingsForCash(
      db as unknown as Db,
      fund,
      Number.POSITIVE_INFINITY
    );
    const sold = Math.min(10, depth) + Math.min(20, depth);
    expect(result).toEqual({ unitsSold: sold, proceedsAnchor: sold * 980, bondsTouched: 2 });
  });

  it("sells enough units at the bid to cover the need, converts to anchor, and releases units to the pool", async () => {
    const bond = {
      _id: new ObjectId(),
      currencyCode: "GBP",
      issuerName: "UK Treasury",
      marketPrice: 1,
      holders: [{ fundId, units: 100 }],
    };
    db.collectionMocks.bonds.find.mockReturnValue({ toArray: async () => [bond] });
    // Need 2,000 anchor = 4,000 GBP at rate 2; bid 990/unit -> 5 units (4,950 GBP = 2,475 anchor).
    vi.mocked(loadBondQuote).mockResolvedValue({
      bidPerUnit: 990,
      depthUnitsAtBid: 1_000,
    } as never);
    db.collectionMocks.bondMarketPools.findOneAndUpdate.mockResolvedValue({ cashLocal: 1 });
    db.collectionMocks.bonds.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const result = await sellFundBondHoldingsForCash(db as unknown as Db, fund, 2_000);

    expect(result.unitsSold).toBe(5);
    expect(result.proceedsAnchor).toBe(2_475);
    expect(db.collectionMocks.bonds.updateOne).toHaveBeenCalledWith(
      {
        _id: bond._id,
        holders: { $elemMatch: { fundId, units: { $gte: 5 } } },
      },
      expect.objectContaining({ $inc: { "holders.$.units": -5, publicFloat: 5 } })
    );
    expect(db.collectionMocks.indexFunds.updateOne).toHaveBeenCalledWith(
      { _id: fundId },
      expect.objectContaining({ $inc: { cashAnchor: 2_475 } })
    );
    expect(db.collectionMocks.indexFundTransactions.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "bond_sale", amountAnchor: 2_475 })
    );
  });

  it("sells nothing into a pool with no depth", async () => {
    db.collectionMocks.bonds.find.mockReturnValue({
      toArray: async () => [
        {
          _id: new ObjectId(),
          currencyCode: "USD",
          marketPrice: 1,
          holders: [{ fundId, units: 10 }],
        },
      ],
    });
    vi.mocked(loadBondQuote).mockResolvedValue({ bidPerUnit: 980, depthUnitsAtBid: 0 } as never);
    const result = await sellFundBondHoldingsForCash(db as unknown as Db, fund, 5_000);
    expect(result.unitsSold).toBe(0);
    expect(db.collectionMocks.bonds.updateOne).not.toHaveBeenCalled();
  });

  it("emits one fund-subject bond_sell row per committed sale when a turn is passed", async () => {
    const bond = {
      _id: new ObjectId(),
      currencyCode: "USD",
      issuerName: "US Treasury",
      marketPrice: 1,
      holders: [{ fundId, units: 10 }],
    };
    db.collectionMocks.bonds.find.mockReturnValue({ toArray: async () => [bond] });
    vi.mocked(loadBondQuote).mockResolvedValue({ bidPerUnit: 980, depthUnitsAtBid: 100 } as never);
    db.collectionMocks.bondMarketPools.findOneAndUpdate.mockResolvedValue({ cashLocal: 1 });
    db.collectionMocks.bonds.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const result = await sellFundBondHoldingsForCash(db as unknown as Db, fund, 1_000, new Date(), {
      turn: 7,
      thresholds: { fund: {} },
    } as never);

    expect(result.unitsSold).toBe(2);
    expect(vi.mocked(loadTxThresholds)).not.toHaveBeenCalled();
    expect(emitTx).toHaveBeenCalledTimes(1);
    expect(emitTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "bond_sell",
        turn: 7,
        subjectType: "fund",
        subjectId: fundId,
        amount: result.proceedsAnchor,
        anchorAmount: result.proceedsAnchor,
        currencyCode: "USD",
        counterpartyType: "system",
      }),
      { fund: {} },
      expect.objectContaining({ _id: expect.any(ObjectId) })
    );
  });

  it("emits no ledger row when no turn is passed", async () => {
    const bond = {
      _id: new ObjectId(),
      currencyCode: "USD",
      marketPrice: 1,
      holders: [{ fundId, units: 10 }],
    };
    db.collectionMocks.bonds.find.mockReturnValue({ toArray: async () => [bond] });
    vi.mocked(loadBondQuote).mockResolvedValue({ bidPerUnit: 980, depthUnitsAtBid: 100 } as never);
    db.collectionMocks.bondMarketPools.findOneAndUpdate.mockResolvedValue({ cashLocal: 1 });
    db.collectionMocks.bonds.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const result = await sellFundBondHoldingsForCash(db as unknown as Db, fund, 1_000);

    expect(result.unitsSold).toBe(2);
    expect(emitTx).not.toHaveBeenCalled();
  });

  it("leaves the pool unchanged when the locked holding is no longer available", async () => {
    const bond = {
      _id: new ObjectId(),
      currencyCode: "USD",
      marketPrice: 1,
      holders: [{ fundId, units: 10 }],
    };
    db.collectionMocks.bonds.find.mockReturnValue({ toArray: async () => [bond] });
    vi.mocked(loadBondQuote).mockResolvedValue({ bidPerUnit: 980, depthUnitsAtBid: 100 } as never);
    db.collectionMocks.bondMarketPools.findOneAndUpdate.mockResolvedValue({ cashLocal: 1 });
    db.collectionMocks.bonds.findOne.mockResolvedValue(null);

    const result = await sellFundBondHoldingsForCash(db as unknown as Db, fund, 1_000);
    expect(result.unitsSold).toBe(0);
    expect(db.collectionMocks.bondMarketPools.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it.each([undefined, 0, -1, NaN, Infinity])(
    "retains a holding when its FX quote is invalid (%s)",
    async (rate) => {
      const bond = {
        _id: new ObjectId(),
        currencyCode: "GBP",
        marketPrice: 1,
        holders: [{ fundId, units: 100 }],
      };
      db.collectionMocks.bonds.find.mockReturnValue({ toArray: async () => [bond] });
      vi.mocked(loadFxRatesRecord).mockResolvedValue(rate === undefined ? {} : { GBP: rate });
      expect(await sellFundBondHoldingsForCash(db as unknown as Db, fund, 1000)).toEqual({
        proceedsAnchor: 0,
        unitsSold: 0,
        bondsTouched: 0,
      });
      expect(db.collectionMocks.bondMarketPools.findOneAndUpdate).not.toHaveBeenCalled();
      expect(db.collectionMocks.indexFunds.updateOne).not.toHaveBeenCalled();
    }
  );
});
