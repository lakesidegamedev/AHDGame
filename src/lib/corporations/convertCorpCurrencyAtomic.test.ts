import { ObjectId, type Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { convertCorpCurrency } from "./convertCorpCurrency";
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
const state = vi.hoisted(() => ({ mode: "basic" }));
vi.mock("@/lib/market/featureFlag", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/market/featureFlag")>()),
  getMarketSystemModeForDb: async () => state.mode,
}));
function fixture() {
  const f = createTransactionalMemoryDb();
  const issuer = new ObjectId(),
    buyer = new ObjectId(),
    site = new ObjectId();
  const corporation = {
    _id: issuer,
    name: "Synthetic",
    countryId: "JP",
    liquidCurrencyCode: "JPY",
    liquidCapital: 1e12,
    sharePrice: 100,
    marketingBudget: 1000,
    logisticsBudget: 2000,
  } as Corporation;
  const sector = {
    _id: site,
    corporationId: issuer,
    sectorType: "agriculture",
    revenue: 10000,
    currentGrowthCost: 100,
    capitalStock: 100,
    capacityBookAnchor: 999,
    inventoryUnits: { food: 7 },
    inventoryValueAnchor: 33,
    buildQueue: [{ unitsOrdered: 100, costPaidAnchor: 2000, startTurn: 10, onlineTurn: 12 }],
  } as unknown as CorporateSector;
  f.memory.seed("corporations", [
    { ...corporation },
    {
      _id: buyer,
      name: "Synthetic buyer",
      countryId: "US",
      liquidCurrencyCode: "USD",
      liquidCapital: 500,
    },
  ]);
  f.memory.seed("corporateSectors", [{ ...sector }]);
  f.memory.seed("shareOrders", [
    {
      _id: new ObjectId(),
      corporationId: issuer,
      placerCorporationId: buyer,
      type: "buy",
      status: "open",
      sharesRemaining: 100,
      escrowAmount: 10000,
      pricePerShare: 100,
    },
  ]);
  f.memory.seed("exchangeRates", [
    { _id: "JPY", currencyCode: "JPY", rate: 100 },
    { _id: "CAD", currencyCode: "CAD", rate: 2 },
    { _id: "USD", currencyCode: "USD", rate: 1 },
  ]);
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 10 }]);
  const rates = new Map([
    ["JPY" as const, 100],
    ["CAD" as const, 2],
    ["USD" as const, 1],
  ]);
  const convert = () => convertCorpCurrency(f.db, corporation, "CAD", rates, new Date(), false);
  return { ...f, issuer, buyer, site, corporation, sector, rates, convert };
}
const corp = (db: Db, id: ObjectId) => db.collection("corporations").findOne({ _id: id });
describe("atomic currency conversion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.mode = "basic";
  });
  it("rolls back refunds and a partially published conversion, then overlapping retries convert once", async () => {
    const f = fixture(),
      sectors = f.memory.collection("corporateSectors");
    const bulk = sectors.bulkWrite.bind(sectors);
    vi.spyOn(sectors, "bulkWrite").mockImplementationOnce(async (...args) => {
      await bulk(...args);
      throw new Error("interrupted sector publish");
    });
    await expect(f.convert()).rejects.toThrow("interrupted sector publish");
    expect(await corp(f.db, f.issuer)).toMatchObject({
      liquidCurrencyCode: "JPY",
      liquidCapital: 1e12,
    });
    expect(await corp(f.db, f.buyer)).toMatchObject({ liquidCapital: 500 });
    expect(f.memory.collection("shareOrders").docs[0].status).toBe("open");
    expect(sectors.docs[0]).toMatchObject({
      revenue: 10000,
      currentGrowthCost: 100,
      inventoryValueAnchor: 33,
    });
    const results = await Promise.all([f.convert(), f.convert()]);
    expect(results.filter((result) => result.ok && result.converted)).toHaveLength(1);
    expect(await corp(f.db, f.issuer)).toMatchObject({
      liquidCurrencyCode: "CAD",
      liquidCapital: 2e10,
    });
    expect(await corp(f.db, f.buyer)).toMatchObject({ liquidCapital: 600 });
    expect(sectors.docs[0]).toMatchObject({
      revenue: 200,
      currentGrowthCost: 2,
      capitalStock: 100,
      capacityBookAnchor: 999,
      inventoryUnits: { food: 7 },
      inventoryValueAnchor: 33,
    });
    expect(sectors.docs[0].buildQueue).toEqual(f.sector.buildQueue);
  });
  it("refuses stale treasury input instead of overwriting an intervening spend", async () => {
    const f = fixture();
    await f.memory
      .collection("corporations")
      .updateOne({ _id: f.issuer }, { $inc: { liquidCapital: -100 } });
    expect((await f.convert()).ok).toBe(false);
    expect(await corp(f.db, f.issuer)).toMatchObject({
      liquidCurrencyCode: "JPY",
      liquidCapital: 1e12 - 100,
    });
    expect(await corp(f.db, f.buyer)).toMatchObject({ liquidCapital: 500 });
  });
  it("does not overwrite an intervening sector update supplied in a stale snapshot", async () => {
    const f = fixture();
    await f.memory
      .collection("corporateSectors")
      .updateOne({ _id: f.site }, { $set: { revenue: 20000 } });
    await expect(
      convertCorpCurrency(f.db, f.corporation, "CAD", f.rates, new Date(), false, [f.sector])
    ).rejects.toThrow("sector count mismatch");
    expect(await corp(f.db, f.issuer)).toMatchObject({
      liquidCurrencyCode: "JPY",
      liquidCapital: 1e12,
    });
    expect(await corp(f.db, f.buyer)).toMatchObject({ liquidCapital: 500 });
    expect(f.memory.collection("corporateSectors").docs[0].revenue).toBe(20000);
  });
  it("keeps host plant revenue and anchor inventory and construction outside the treasury denomination change", async () => {
    const f = fixture();
    state.mode = "plants";
    expect((await f.convert()).ok).toBe(true);
    expect(f.memory.collection("corporateSectors").docs[0]).toMatchObject({
      revenue: 10000,
      inventoryValueAnchor: 33,
      capacityBookAnchor: 999,
    });
    expect(f.memory.collection("corporateSectors").docs[0].buildQueue).toEqual(f.sector.buildQueue);
  });
  it("never falls back to sequential writes when transactions are unavailable", async () => {
    const f = fixture();
    Object.assign(f.db, {
      client: {
        writeConcern: { w: "majority" },
        startSession: () => ({
          withTransaction: async () => {
            throw Object.assign(new Error("transactions unavailable"), { code: 20 });
          },
          endSession: async () => {},
        }),
      },
    });
    await expect(f.convert()).rejects.toThrow("transactions unavailable");
    expect(await corp(f.db, f.issuer)).toMatchObject({
      liquidCurrencyCode: "JPY",
      liquidCapital: 1e12,
    });
    expect(f.memory.collection("shareOrders").docs[0].status).toBe("open");
  });
});

it("converts refundable venture cash and returns its current denomination once", async () => {
  const { refundVentureReceipt } = await import("@/lib/products/venture/refund");
  const f = fixture();
  const receipts = {
    synthetic: {
      turn: 10,
      amountAnchor: 100,
      investmentAnchor: 100,
      chargeAnchor: 0,
      localAmount: 10000,
    },
  };
  f.corporation.productVentureDebitsV1 = receipts;
  await f.memory
    .collection("corporations")
    .updateOne({ _id: f.issuer }, { $set: { productVentureDebitsV1: receipts } });
  expect((await f.convert()).ok).toBe(true);
  expect((await corp(f.db, f.issuer))?.productVentureDebitsV1).toEqual({
    synthetic: { ...receipts.synthetic, localAmount: 200 },
  });
  const before = Number((await corp(f.db, f.issuer))?.liquidCapital);
  const refunds = await Promise.all(
    [0, 1].map(() => refundVentureReceipt(f.db, f.issuer, "synthetic", 10))
  );
  expect(refunds.filter(Boolean)).toHaveLength(1);
  expect((await corp(f.db, f.issuer))?.liquidCapital).toBe(before + 200);
});
