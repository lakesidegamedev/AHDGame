import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { getDb } from "@/lib/mongodb";
import { processSavingsInterestTurn } from "./savingsInterestTurn";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTx: vi.fn().mockResolvedValue("applied"),
  emitTxBulk: vi.fn().mockResolvedValue(undefined),
  loadTxThresholds: vi.fn().mockResolvedValue({}),
}));
beforeEach(() => vi.clearAllMocks());
function setup() {
  const f = createTransactionalMemoryDb(),
    owner = new ObjectId();
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 10,
      preset: "2027-default",
      forexEnabled: true,
      resetWorldId: "synthetic",
    },
  ]);
  f.memory.seed("gameConfig", [
    {
      _id: "default",
      privateBankingEnabled: true,
      savingsAccountsMode: "authoritative",
      savingsAccountsReadCurrencies: ["USD"],
    },
  ]);
  f.memory.seed("centralBanks", [
    { _id: "US", primeRate: 10, nationalSavingsBalance: 10000, inflationHistory: [{ rate: 0 }] },
  ]);
  f.memory.seed("exchangeRates", [{ _id: "US", currencyCode: "USD", rate: 1 }]);
  f.memory.seed("characters", [
    {
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
    },
  ]);
  f.memory.seed("savingsAccounts", [
    {
      _id: "synthetic",
      ownerType: "character",
      ownerId: owner,
      currency: "USD",
      balance: 10000,
      accruedInterest: 0,
      interestEarned: 0,
      version: 0,
      holder: { type: "centralBank", id: "US" },
    },
  ]);
  vi.mocked(getDb).mockResolvedValue(f.db);
  return { ...f, owner };
}
it.each([false, true])("accrues once regardless of the outer rerun flag %s", async (flag) => {
  const f = setup();
  await Promise.all([
    processSavingsInterestTurn(f.db, 10, flag),
    processSavingsInterestTurn(f.db, 10, flag),
  ]);
  expect(f.memory.collection("characters").docs[0].currencyBalances).toMatchObject({
    pendingSavingsInterest: { USD: 2.6 },
  });
  expect(f.memory.collection("savingsAccounts").docs[0].accruedInterest).toBe(2.6);
  expect(
    f.memory.collection("bankMoneyMoves").docs.filter((r) => r.kind === "turn-value-settlement")
  ).toHaveLength(1);
});
it("rolls back character accrual and account accrual together after an unacknowledged account write", async () => {
  const f = setup(),
    accounts = f.memory.collection("savingsAccounts"),
    write = accounts.bulkWrite.bind(accounts);
  vi.spyOn(accounts, "bulkWrite").mockImplementationOnce(async (...args) => {
    await write(...args);
    throw new Error("account acknowledgement lost");
  });
  await expect(processSavingsInterestTurn(f.db, 10, false)).rejects.toThrow(
    "account acknowledgement lost"
  );
  expect(f.memory.collection("characters").docs[0].currencyBalances).toMatchObject({
    pendingSavingsInterest: { USD: 0 },
  });
  expect(accounts.docs[0].accruedInterest).toBe(0);
  expect(f.memory.collection("bankMoneyMoves").docs).toHaveLength(0);
  await processSavingsInterestTurn(f.db, 10, false);
  expect(accounts.docs[0].accruedInterest).toBe(2.6);
});
it("commits quarterly income tax, account credit, displayed receipt and phase completion together", async () => {
  const f = setup(),
    ledger = f.memory.collection("savingsLedger"),
    write = ledger.insertMany.bind(ledger);
  vi.spyOn(ledger, "insertMany").mockImplementationOnce(async (...args) => {
    await write(...args);
    throw new Error("quarterly ledger acknowledgement lost");
  });
  await expect(processSavingsInterestTurn(f.db, 12, false)).rejects.toThrow(
    "quarterly ledger acknowledgement lost"
  );
  expect(f.memory.collection("characters").docs[0].currencyBalances).toMatchObject({
    savings: { USD: 10000 },
    pendingSavingsInterest: { USD: 0 },
  });
  expect(f.memory.collection("savingsAccounts").docs[0]).toMatchObject({
    balance: 10000,
    accruedInterest: 0,
  });
  expect(f.memory.collection("playerIncomeTaxBatches").docs).toHaveLength(0);
  await processSavingsInterestTurn(f.db, 12, false);
  await processSavingsInterestTurn(f.db, 12, false);
  expect(f.memory.collection("characters").docs[0].currencyBalances).toMatchObject({
    savings: { USD: 10002.6 },
    pendingSavingsInterest: { USD: 0 },
  });
  expect(f.memory.collection("savingsAccounts").docs[0]).toMatchObject({
    balance: 10002.6,
    accruedInterest: 0,
  });
  expect(ledger.docs).toHaveLength(1);
  expect(f.memory.collection("centralBanks").docs[0].savingsInterestPaidLifetime).toBe(2.6);
});

it("finishes a partial currency rollout without requiring unmigrated account mirrors", async () => {
  const f = setup();
  await f.memory.collection("characters").updateOne(
    { _id: f.owner },
    {
      $set: {
        "currencyBalances.savings.GBP": 4800,
        "currencyBalances.savingsHolder.GBP": "centralBank",
      },
    }
  );
  await f.memory.collection("centralBanks").insertOne({
    _id: "UK",
    primeRate: 10,
    nationalSavingsBalance: 1e9,
    inflationHistory: [{ rate: 0 }],
  });
  await f.memory
    .collection("exchangeRates")
    .insertOne({ _id: "UK", currencyCode: "GBP", rate: 0.8 });
  await processSavingsInterestTurn(f.db, 12, false);
  expect(f.memory.collection("characters").docs[0].currencyBalances).toMatchObject({
    savings: { USD: 10002.6, GBP: 4805 },
  });
  expect(f.memory.collection("savingsAccounts").docs).toHaveLength(1);
  expect(f.memory.collection("savingsLedger").docs).toHaveLength(2);
});
