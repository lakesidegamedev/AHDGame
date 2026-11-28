import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Bond, IndexFund } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { purchaseBondUnitsForFund } from "./purchaseBondUnitsForFund";
vi.mock("@/lib/bonds/marketPoolLedger", () => ({
  currentBondPoolLedgerContext: async () => null,
  witnessBondPoolCash: async () => undefined,
}));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn().mockResolvedValue(undefined) }));
beforeEach(() => vi.clearAllMocks());
function setup() {
  const f = createTransactionalMemoryDb();
  const fund = {
    _id: new ObjectId(),
    name: "Synthetic",
    cashAnchor: 10_000,
    quotedNav: 1,
    anchorCurrencyCode: "USD",
  } as IndexFund;
  const bond = {
    _id: new ObjectId(),
    issuerType: "corporation",
    currencyCode: "USD",
    marketPrice: 1,
    publicFloat: 1,
    totalIssued: 1000,
    holders: [],
    matured: false,
    defaulted: false,
  } as unknown as Bond;
  f.memory.seed("indexFunds", [{ ...fund }]);
  f.memory.seed("bonds", [{ ...bond }]);
  f.memory.seed("bondMarketPools", [{ _id: "USD", cashLocal: 100_000, targetCashLocal: 100_000 }]);
  f.memory.seed("exchangeRates", [{ _id: "USD", currencyCode: "USD", rate: 1 }]);
  return { ...f, fund, bond };
}
it("rolls back fund debit, acquired units and pool credit when the receipt fails", async () => {
  const f = setup();
  const original = f.memory
    .collection("indexFundTransactions")
    .insertOne.bind(f.memory.collection("indexFundTransactions"));
  const insert = vi
    .spyOn(f.memory.collection("indexFundTransactions"), "insertOne")
    .mockRejectedValueOnce(new Error("interrupted bond receipt"));
  await expect(purchaseBondUnitsForFund(f.db, f.fund, f.bond, 1)).rejects.toThrow(
    "interrupted bond receipt"
  );
  expect(f.memory.collection("indexFunds").docs[0].cashAnchor).toBe(10_000);
  expect(f.memory.collection("bonds").docs[0]).toMatchObject({ publicFloat: 1, holders: [] });
  expect(f.memory.collection("bondMarketPools").docs[0].cashLocal).toBe(100_000);
  insert.mockImplementation(original);
  const results = await Promise.all(
    [0, 1].map(() => purchaseBondUnitsForFund(f.db, f.fund, f.bond, 1))
  );
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  const paid = 10_000 - Number(f.memory.collection("indexFunds").docs[0].cashAnchor);
  expect(Number(f.memory.collection("bondMarketPools").docs[0].cashLocal) - 100_000).toBeCloseTo(
    paid,
    8
  );
  expect(f.memory.collection("bonds").docs[0].publicFloat).toBe(0);
  expect(f.memory.collection("indexFundTransactions").docs).toHaveLength(1);
});
