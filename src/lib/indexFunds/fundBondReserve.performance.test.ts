import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { IndexFund } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { deployBondReserveFromCash } from "./fundBondReserve";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
function fixture() {
  const f = createTransactionalMemoryDb();
  const fund = {
    _id: new ObjectId(),
    name: "Synthetic fund",
    tickerSymbol: "SYN",
    reserveUnits: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    slug: "synthetic",
    kind: "broad",
    scope: "country",
    countryId: "US",
    anchorCurrencyCode: "USD",
    cashAnchor: 1e6,
    quotedNav: 100,
    unitSupply: 10000,
    holdings: [],
    targetConstituents: [],
    status: "active",
  } as IndexFund;
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 100, preset: "2019-default" }]);
  f.memory.seed("indexFunds", [{ ...fund }]);
  f.memory.seed("exchangeRates", [{ currencyCode: "USD", rate: 1 }]);
  f.memory.seed(
    "bonds",
    Array.from({ length: 10 }, () => ({
      _id: new ObjectId(),
      issuerType: "sovereign",
      countryId: "US",
      currencyCode: "USD",
      matured: false,
      defaulted: false,
      publicFloat: 10000,
      totalIssued: 1e7,
      faceValue: 1000,
      marketPrice: 1,
      holders: [],
      maturityTurn: 200,
    }))
  );
  return { ...f, fund };
}
describe("fund bond reserve receipts and batching", () => {
  beforeEach(() => vi.clearAllMocks());
  it("retains only receipts for earlier committed purchases when a later debit fails", async () => {
    const f = fixture(),
      fault = withInjectedCrash(f.memory, {
        collection: "indexFunds",
        op: "findOneAndUpdate",
        onCall: 3,
        afterWrite: true,
      });
    await expect(
      deployBondReserveFromCash(fault.db, f.fund, 0, { liquidityTargetEnabled: true, turn: 100 })
    ).rejects.toThrow();
    const receipts = f.memory.collection("indexFundTransactions").docs;
    expect(receipts).toHaveLength(2);
    expect(f.memory.collection("financialTxLog").docs).toHaveLength(2);
    expect(f.memory.collection("indexFunds").docs[0].cashAnchor).toBeCloseTo(
      1e6 - receipts.reduce((sum, row) => sum + Number(row.amountAnchor), 0),
      6
    );
  });
  it("rolls back the purchase when its receipt cannot persist", async () => {
    const f = fixture();
    vi.spyOn(f.memory.collection("indexFundTransactions"), "insertOne").mockRejectedValueOnce(
      new Error("receipt unavailable")
    );
    await expect(
      deployBondReserveFromCash(f.db, f.fund, 0, { liquidityTargetEnabled: true, turn: 100 })
    ).rejects.toThrow("receipt unavailable");
    expect(f.memory.collection("indexFunds").docs[0].cashAnchor).toBe(1e6);
    expect(f.memory.collection("bonds").docs.every((bond) => bond.publicFloat === 10000)).toBe(
      true
    );
    expect(f.memory.collection("financialTxLog").docs).toHaveLength(0);
  });
  it("commits ten ordered purchases with one write per receipt collection", async () => {
    const f = fixture();
    const financial = vi.spyOn(f.memory.collection("financialTxLog"), "insertMany");
    const transactions = vi.spyOn(f.memory.collection("indexFundTransactions"), "insertMany");
    const result = await deployBondReserveFromCash(f.db, f.fund, 0, {
      liquidityTargetEnabled: true,
      settleInTransaction: true,
      turn: 100,
    });
    expect(result.unitsPurchased).toBeGreaterThan(0);
    expect(financial).toHaveBeenCalledOnce();
    expect(transactions).toHaveBeenCalledOnce();
    expect(f.memory.collection("indexFundTransactions").docs).toHaveLength(10);
    expect(f.memory.collection("financialTxLog").docs).toHaveLength(10);
    expect(f.memory.collection("indexFunds").docs[0].cashAnchor).toBeCloseTo(
      1e6 - result.deployedAnchor,
      6
    );
  });
  it("rolls back all batch money and custody after a landed ledger failure", async () => {
    const f = fixture(),
      fault = withInjectedCrash(f.memory, {
        collection: "financialTxLog",
        op: "insertMany",
        onCall: 1,
        afterWrite: true,
      });
    await expect(
      deployBondReserveFromCash(fault.db, f.fund, 0, {
        liquidityTargetEnabled: true,
        settleInTransaction: true,
        turn: 100,
      })
    ).rejects.toThrow();
    expect(f.memory.collection("indexFunds").docs[0].cashAnchor).toBe(1e6);
    expect(f.memory.collection("bonds").docs.every((bond) => bond.publicFloat === 10000)).toBe(
      true
    );
    expect(f.memory.collection("indexFundTransactions").docs).toHaveLength(0);
    expect(f.memory.collection("financialTxLog").docs).toHaveLength(0);
  });
});
