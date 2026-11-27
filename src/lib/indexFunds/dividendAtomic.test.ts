import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { processIndexFundDividend, processIndexFundDividendsBatch } from "./dividendPassThrough";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn(async () => false) }));

it.each(["single", "batch"])(
  "rolls back interrupted %s institutional payouts and pays concurrent retries once",
  async (mode) => {
    const { db, memory } = createTransactionalMemoryDb();
    const fundId = new ObjectId(),
      issuer = new ObjectId(),
      holder = new ObjectId(),
      npp = new ObjectId();
    memory.seed("gameState", [{ _id: "current", currentTurn: 10 }]);
    memory.seed("indexFunds", [
      {
        _id: fundId,
        name: "Synthetic Fund",
        slug: "synthetic",
        unitSupply: 100,
        cashAnchor: 1000,
        anchorCurrencyCode: "USD",
      },
    ]);
    memory.seed("corporations", [
      { _id: issuer, name: "Issuer" },
      {
        _id: holder,
        name: "Holder",
        liquidCapital: 100,
        countryId: "US",
        liquidCurrencyCode: "USD",
      },
    ]);
    memory.seed("npps", [{ _id: npp, countryId: "US", nppInvestmentCashAnchor: 100 }]);
    memory.seed("indexFundPositions", [
      { _id: new ObjectId(), fundId, holderKind: "corporation", corporationId: holder, units: 50 },
      { _id: new ObjectId(), fundId, holderKind: "npp", nppId: npp, units: 50 },
    ]);
    const fault = withInjectedCrash(memory, {
      collection: "indexFundTransactions",
      op: mode === "single" ? "insertOne" : "insertMany",
      onCall: 1,
      afterWrite: true,
    });
    Object.assign(fault.db, { client: db.client });
    const run = (target = db) =>
      mode === "single"
        ? processIndexFundDividend(target, fundId, 100, issuer, 10, { turn: 10 })
        : processIndexFundDividendsBatch(
            target,
            [{ fundId, corporationId: issuer, amountAnchor: 100, shares: 10 }],
            { turn: 10 }
          );
    await expect(run(fault.db)).rejects.toThrow();
    expect(memory.collection("indexFunds").docs[0].cashAnchor).toBe(1000);
    expect(memory.collection("corporations").docs[1].liquidCapital).toBe(100);
    expect(memory.collection("npps").docs[0].nppInvestmentCashAnchor).toBe(100);
    expect(memory.collection("indexFundTransactions").docs).toHaveLength(0);
    fault.disarm();
    await Promise.all([run(), run(), run()]);
    expect(memory.collection("indexFunds").docs[0].cashAnchor).toBe(1075);
    expect(memory.collection("corporations").docs[1].liquidCapital).toBe(112.5);
    expect(memory.collection("npps").docs[0].nppInvestmentCashAnchor).toBe(112.5);
    expect(
      memory.collection("bankMoneyMoves").docs.filter((row) => row.kind === "turn-value-settlement")
    ).toHaveLength(1);
  }
);

it.each(["single", "batch"])("%s retains all cash in funds with no issued units", async (mode) => {
  const { db, memory } = createTransactionalMemoryDb();
  const fundId = new ObjectId(),
    issuer = new ObjectId();
  memory.seed("gameState", [{ _id: "current", currentTurn: 10 }]);
  memory.seed("indexFunds", [
    {
      _id: fundId,
      name: "Empty",
      slug: "empty",
      unitSupply: 0,
      cashAnchor: 100,
      anchorCurrencyCode: "USD",
    },
  ]);
  memory.seed("corporations", [{ _id: issuer, name: "Issuer" }]);
  if (mode === "single") await processIndexFundDividend(db, fundId, 1.5, issuer, 10, { turn: 10 });
  else
    await processIndexFundDividendsBatch(
      db,
      [{ fundId, corporationId: issuer, amountAnchor: 1.5, shares: 10 }],
      { turn: 10 }
    );
  expect(memory.collection("indexFunds").docs[0].cashAnchor).toBe(101.5);
});
