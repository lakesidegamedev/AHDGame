import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/currency/featureFlag", () => ({
  isForexEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/bonds/corporateBondDefault", () => ({
  buildPrimeRateMap: vi.fn(() => new Map()),
  // Per-sector NPV: helper calls this with a single-element array.
  computeSectorNpvSum: vi.fn((sectors: { revenue: number }[]) => sectors[0]?.revenue ?? 0),
  sumDefaultedBondPrincipal: vi.fn(() => 1000),
}));
vi.mock("@/lib/bonds/marketPool", () => ({
  bondPoolCurrency: vi.fn(() => "USD"),
  creditBondPool: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/turn/nppBondCash", () => ({
  payNppBondReturns: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/corporations/restoreSectorsToUnowned", () => ({
  restoreSectorsToUnowned: vi.fn().mockResolvedValue({
    sectorsProcessed: 0,
    sectorsDeleted: 0,
    poolsUpdated: 0,
    totalRevenueRestored: 0,
  }),
}));
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTxBulk: vi.fn().mockResolvedValue(undefined),
  loadTxThresholds: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/wireEvent", () => ({
  logWireEvent: vi.fn().mockResolvedValue(undefined),
  wireHeadlineCorpRestructured: vi.fn(() => "RESTRUCTURING"),
}));

function makeCursor<T>(docs: T[]) {
  return {
    toArray: vi.fn().mockResolvedValue(docs),
    project: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
  };
}

let db: MockDb;

describe("executeCorporationBondRestructure", () => {
  const corpId = new ObjectId();
  const charId = new ObjectId();
  const idA = new ObjectId();
  const idB = new ObjectId();
  const idC = new ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();

    const corp = { _id: corpId, name: "Acme", liquidCapital: 0 };
    db.collection("corporations").findOne.mockResolvedValue(corp);

    const bond = {
      _id: new ObjectId(),
      corporationId: corpId,
      couponRate: 5,
      currencyCode: undefined,
      holders: [{ characterId: charId, units: 10 }],
    };
    db.collection("bonds").find.mockReturnValue(makeCursor([bond]));
    db.collection("bonds").updateMany.mockResolvedValue({
      modifiedCount: 1,
      matchedCount: 1,
    } as never);

    // NPV by sector = revenue. Salvage = npv×0.85 → B 850, A 680, C 340.
    db.collection("corporateSectors").find.mockReturnValue(
      makeCursor([
        { _id: idA, corporationId: corpId, revenue: 800 },
        { _id: idB, corporationId: corpId, revenue: 1000 },
        { _id: idC, corporationId: corpId, revenue: 400 },
      ])
    );
    db.collection("centralBanks").find.mockReturnValue(makeCursor([]));
    db.collection("characters").find.mockReturnValue(
      makeCursor([{ _id: charId, countryId: "US", name: "Alice" }])
    );
    db.collection("exchangeRates").findOne.mockResolvedValue(null);
  });

  it("liquidates the minimum highest-value sectors and cures bonds as a restructure", async () => {
    const { executeCorporationBondRestructure } =
      await import("./executeCorporationBondRestructure");
    const { restoreSectorsToUnowned } = await import("@/lib/corporations/restoreSectorsToUnowned");

    const result = await executeCorporationBondRestructure(
      db as unknown as Db,
      { _id: corpId } as never,
      {
        now: new Date(),
        cureTurn: 50,
      }
    );

    // need = 1000 - 0 = 1000. Greedy over [B 850, A 680, C 340]: B(850) then A → 1530 ≥ 1000.
    // So sectors B and A are sold; C is kept.
    expect(restoreSectorsToUnowned).toHaveBeenCalledTimes(1);
    const liquidated = vi.mocked(restoreSectorsToUnowned).mock.calls[0]![1] as { _id: ObjectId }[];
    const liquidatedIds = liquidated.map((s) => s._id.toString()).sort();
    expect(liquidatedIds).toEqual([idA.toString(), idB.toString()].sort());

    // Bonds cured with the restructure cure method.
    const updateManyCall = db.collection("bonds").updateMany.mock.calls[0]!;
    expect(
      (updateManyCall[1] as { $set: { defaultCure: { cureMethod: string } } }).$set.defaultCure
    ).toEqual({ cureMethod: "restructure", curedAtTurn: 50 });

    // Corp liquid capital nets +proceeds(1530) -cost(1000) = +530.
    const corpUpdate = db.collection("corporations").updateOne.mock.calls[0]!;
    expect((corpUpdate[1] as { $inc: { liquidCapital: number } }).$inc.liquidCapital).toBeCloseTo(
      530,
      6
    );

    // Bondholder was paid (characters bulkWrite issued).
    expect(db.collection("characters").bulkWrite).toHaveBeenCalled();

    expect(result.sectorsLiquidated).toBe(2);
    expect(result.bondsMatured).toBe(1);
    expect(result.paid).toBe(1000);
  });

  it("pays fund, NPP and pool holders in full and does not debit the issuer's own units", async () => {
    const fundId = new ObjectId();
    const nppId = new ObjectId();
    db.collection("bonds").find.mockReturnValue(
      makeCursor([
        {
          _id: new ObjectId(),
          corporationId: corpId,
          couponRate: 5,
          currencyCode: undefined,
          publicFloat: 1,
          totalIssued: 5000,
          holders: [
            { characterId: charId, units: 1 },
            { fundId, units: 1 },
            { nppId, units: 1 },
            { corporationId: corpId, units: 1 },
          ],
        },
      ])
    );
    db.collection("corporateSectors").find.mockReturnValue(
      makeCursor([
        { _id: idA, corporationId: corpId, revenue: 2000 },
        { _id: idB, corporationId: corpId, revenue: 300 },
      ])
    );
    db.collection("indexFunds").find.mockReturnValue(
      makeCursor([{ _id: fundId, name: "Index", anchorCurrencyCode: "USD" }])
    );
    const defaults = await import("@/lib/bonds/corporateBondDefault");
    vi.mocked(defaults.sumDefaultedBondPrincipal).mockReturnValue(1000);
    vi.mocked(defaults.computeSectorNpvSum).mockImplementation(
      (sectors: { revenue: number }[]) => sectors[0]?.revenue ?? 0
    );
    const { executeCorporationBondRestructure } =
      await import("./executeCorporationBondRestructure");
    const { creditBondPool } = await import("@/lib/bonds/marketPool");
    const { payNppBondReturns } = await import("@/lib/turn/nppBondCash");

    await executeCorporationBondRestructure(db as unknown as Db, { _id: corpId } as never, {
      now: new Date(),
      cureTurn: 50,
    });

    // The stubbed principal is 1000 and equals the issuer's own unit, which is not
    // debited, so the whole 1700 of salvage stays with the issuer.
    const corpUpdate = db.collection("corporations").updateOne.mock.calls[0]!;
    expect((corpUpdate[1] as { $inc: { liquidCapital: number } }).$inc.liquidCapital).toBeCloseTo(
      1700,
      6
    );
    expect(creditBondPool).toHaveBeenCalledWith(
      expect.anything(),
      "USD",
      1000,
      "maturitiesIn",
      expect.any(Date)
    );
    const fundOps = db.collection("indexFunds").bulkWrite.mock.calls[0]![0] as {
      updateOne: { filter: { _id: ObjectId }; update: { $inc: { cashAnchor: number } } };
    }[];
    expect(fundOps).toHaveLength(1);
    expect(fundOps[0]!.updateOne.update.$inc.cashAnchor).toBe(1000);
    const nppReturns = vi.mocked(payNppBondReturns).mock.calls[0]![1];
    expect(nppReturns.get(nppId.toString())).toEqual({ total: 1000, coupon: 0, maturity: 1000 });
    expect(db.collection("characters").bulkWrite).toHaveBeenCalled();
  });

  it("throws (caller falls back to dissolve) when sectors can't cover the debt", async () => {
    // Shrink every sector so total salvage < 1000.
    db.collection("corporateSectors").find.mockReturnValue(
      makeCursor([{ _id: idA, corporationId: corpId, revenue: 100 }])
    );
    const { executeCorporationBondRestructure } =
      await import("./executeCorporationBondRestructure");
    await expect(
      executeCorporationBondRestructure(db as unknown as Db, { _id: corpId } as never, {
        now: new Date(),
        cureTurn: 50,
      })
    ).rejects.toThrow(/Insufficient sector value/);
  });

  it("throws when there are no defaulted bonds", async () => {
    db.collection("bonds").find.mockReturnValue(makeCursor([]));
    const { executeCorporationBondRestructure } =
      await import("./executeCorporationBondRestructure");
    await expect(
      executeCorporationBondRestructure(db as unknown as Db, { _id: corpId } as never, {
        now: new Date(),
        cureTurn: 50,
      })
    ).rejects.toThrow(/No defaulted bonds/);
  });
});
