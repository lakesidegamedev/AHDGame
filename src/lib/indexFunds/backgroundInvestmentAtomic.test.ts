import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { processNPPFundInvestments } from "./nppInvesting";
import { markNationalIndexFunds } from "@/lib/world/macro/nationalIndexFunds";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

it("rolls back interrupted NPP accrual, subscription and source stamp, then replays once", async () => {
  const { db, memory } = createTransactionalMemoryDb();
  const npp = new ObjectId(),
    fund = new ObjectId();
  memory.seed("gameState", [{ _id: "current", currentTurn: 15, preset: "2019-default" }]);
  memory.seed("exchangeRates", [{ currencyCode: "USD", rate: 1 }]);
  memory.seed("npps", [
    {
      _id: npp,
      countryId: "US",
      retiredAt: null,
      favorability: 80,
      politicalInfluence: 80,
      nppInvestmentCashAnchor: 1000,
    },
  ]);
  memory.seed("indexFunds", [
    {
      _id: fund,
      name: "Synthetic",
      slug: "synthetic",
      status: "active",
      scope: "country",
      kind: "broad",
      countryId: "US",
      anchorCurrencyCode: "USD",
      quotedNav: 100,
      unitSupply: 10,
      cashAnchor: 1000,
    },
  ]);
  const fault = withInjectedCrash(memory, {
    collection: "indexFundTransactions",
    op: "insertMany",
    onCall: 1,
    afterWrite: true,
  });
  Object.assign(fault.db, { client: db.client });
  expect(
    (await processNPPFundInvestments(fault.db, { currentTurn: 16 })).errors.length
  ).toBeGreaterThan(0);
  expect(memory.collection("npps").docs[0]).toMatchObject({ nppInvestmentCashAnchor: 1000 });
  expect(memory.collection("npps").docs[0].lastIndexFundInvestmentTurn).toBeUndefined();
  expect(memory.collection("indexFunds").docs[0]).toMatchObject({
    cashAnchor: 1000,
    unitSupply: 10,
  });
  expect(memory.collection("indexFundPositions").docs).toHaveLength(0);
  fault.disarm();
  const [result] = await Promise.all([
    processNPPFundInvestments(db, { currentTurn: 16 }),
    processNPPFundInvestments(db, { currentTurn: 16 }),
  ]);
  expect(result.errors).toEqual([]);
  expect(result.totalInvested).toBeGreaterThan(0);
  expect(memory.collection("indexFunds").docs[0]).toMatchObject({
    cashAnchor: 1000 + result.totalInvested,
    unitSupply: 10 + result.totalInvested / 100,
  });
  expect(memory.collection("indexFundPositions").docs).toHaveLength(1);
  expect(memory.collection("indexFundTransactions").docs).toHaveLength(1);
});

it("keeps a background fund mark and its receipt atomic across interruption and retries", async () => {
  const { db, memory } = createTransactionalMemoryDb();
  const fund = new ObjectId();
  memory.seed("gameState", [{ _id: "current", currentTurn: 7 }]);
  memory.seed("indexFunds", [
    {
      _id: fund,
      slug: "fr-national",
      name: "France",
      anchorCurrencyCode: "EUR",
      quotedNav: 100,
      unitSupply: 100,
      cashAnchor: 10000,
      nationalIndex: { entityId: "FR" },
    },
  ]);
  const marks = [{ countryId: "FR", displayName: "France", currencyCode: "EUR", nav: 110 }];
  const fault = withInjectedCrash(memory, {
    collection: "indexFundTransactions",
    op: "insertMany",
    onCall: 1,
    afterWrite: true,
  });
  Object.assign(fault.db, { client: db.client });
  await expect(markNationalIndexFunds(fault.db, marks, 7)).rejects.toThrow();
  expect(memory.collection("indexFunds").docs[0]).toMatchObject({
    cashAnchor: 10000,
    quotedNav: 100,
  });
  expect(memory.collection("indexFundTransactions").docs).toHaveLength(0);
  fault.disarm();
  await Promise.all([markNationalIndexFunds(db, marks, 7), markNationalIndexFunds(db, marks, 7)]);
  expect(memory.collection("indexFunds").docs[0]).toMatchObject({
    cashAnchor: 11000,
    quotedNav: 110,
  });
  expect(memory.collection("indexFundTransactions").docs).toHaveLength(1);
});
