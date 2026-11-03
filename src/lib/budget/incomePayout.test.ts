import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { creditIncomeAfterTax } from "./incomePayout";
import { processPlayerIncomeTax } from "./playerIncomeTax";
function clone<T>(value: T): T {
  if (value instanceof ObjectId) return new ObjectId(value.toHexString()) as T;
  if (value instanceof Date) return new Date(value) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
  return value;
}
const transaction = vi.hoisted(() => ({ begin: () => () => {} }));
vi.mock("@/lib/db/runRequiredTransaction", () => ({
  runRequiredTransaction: async (body: (session: object) => unknown) => {
    const rollback = transaction.begin();
    try {
      return await body({});
    } catch (error) {
      rollback();
      throw error;
    }
  },
}));
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
const now = new Date("2026-10-31T12:00:00Z");
function fixture(
  countryId = "US",
  currency = "USD",
  rate = 1,
  ownerCollection: "characters" | "imperialCharacters" = "characters"
) {
  const memory = createInMemoryDb();
  transaction.begin = () => {
    const snapshot = new Map(
      [...memory.collections].map(([name, collection]) => [name, clone(collection.docs)])
    );
    return () => {
      for (const [name, collection] of memory.collections)
        collection.docs = clone(snapshot.get(name) ?? []);
    };
  };
  const characterId = new ObjectId();
  memory.seed(ownerCollection, [
    {
      _id: characterId,
      name: "Test Taxpayer",
      countryId,
      homeState: "REGION",
      incomeTaxStartTurn: 1,
      incomeTier: "high",
      currencyBalances: { personal: { [currency]: 0 }, savings: { [currency]: 1000 } },
    },
  ]);
  memory.seed("gameState", [{ _id: "current", resetWorldId: "test", forexEnabled: true }]);
  memory.seed("gameConfig", [{ _id: "default", treasuryCashLedgerEnabled: true }]);
  const budgetId = countryId === "US" ? "federal" : countryId;
  memory.seed("federalBudget", [
    {
      _id: budgetId,
      countryId,
      currencyCode: currency,
      taxRates: { incomeTax: 20 },
      treasuryBalance: 0,
      treasuryCashLocal: 0,
    },
  ]);
  memory.seed("stateBudgets", [
    { _id: "REGION", countryId, taxRates: { incomeTax: 10 }, balance: 0 },
  ]);
  memory.seed("exchangeRates", [{ _id: currency, currencyCode: currency, rate }]);
  memory.seed("macroMetrics", [{ _id: "REGION", economic: { medianIncome: { value: 100 } } }]);
  const debt = {
    _id: "old-debt",
    characterId,
    ownerCollection,
    worldId: "test",
    turn: 1,
    name: "Test Taxpayer",
    tier: "high",
    currency,
    sourcePath: "currencyBalances.personal." + currency,
    sourceFx: rate,
    walletFx: rate,
    countryId,
    nationalBudgetId: budgetId,
    nationalCurrency: currency,
    nationalFx: rate,
    stateId: "REGION",
    regionalCurrency: currency,
    regionalFx: rate,
    gross: 500,
    federal: 40,
    regional: 10,
    net: 450,
    status: "unpaid",
    createdAt: now,
  };
  memory.seed("playerIncomeTaxAssessments", [debt]);
  return { memory, db: memory as unknown as Db, characterId, ownerCollection, currency, budgetId };
}
describe("source income settlement", () => {
  it.each([
    ["US", "USD", 1],
    ["UK", "GBP", 0.8],
    ["JP", "JPY", 150],
  ] as const)(
    "settles current tax and arrears before the %s wallet",
    async (country, currency, rate) => {
      const f = fixture(country, currency, rate);
      const credit = {
        characterId: f.characterId,
        ownerCollection: f.ownerCollection,
        currency,
        gross: 100,
        income: 100,
      };
      const first = await creditIncomeAfterTax(f.db, "salary", 2, now, [credit]);
      expect(first[0]).toMatchObject({ currentTax: 30, arrearsPaid: 50, net: 20 });
      await creditIncomeAfterTax(f.db, "salary", 2, now, [credit]);
      const actor = await f.db.collection(f.ownerCollection).findOne({ _id: f.characterId });
      expect(actor?.currencyBalances.personal[currency]).toBe(20);
      expect(
        await f.db.collection("playerIncomeTaxAssessments").findOne({ _id: "old-debt" as never })
      ).toMatchObject({ status: "paid", collectedFederal: 40, collectedRegional: 10 });
      expect(
        await f.db.collection("federalBudget").findOne({ _id: f.budgetId as never })
      ).toMatchObject({ treasuryBalance: 60, treasuryCashLocal: 60 });
      expect(
        await f.db.collection("stateBudgets").findOne({ _id: "REGION" as never })
      ).toMatchObject({ balance: 20 });
    }
  );
  it("does not assess source-taxed gross again at closing", async () => {
    const f = fixture();
    await creditIncomeAfterTax(f.db, "salary", 2, now, [
      {
        characterId: f.characterId,
        ownerCollection: f.ownerCollection,
        currency: "USD",
        gross: 100,
        income: 100,
      },
    ]);
    f.memory.seed("financialTxLog", [
      {
        _id: new ObjectId(),
        subjectType: "character",
        subjectId: f.characterId,
        type: "corp_salary",
        turn: 2,
        amount: 100,
        currencyCode: "USD",
        anchorAmount: 100,
        meta: { incomeTaxAtSource: true },
      },
    ]);
    await processPlayerIncomeTax(f.db, 2, now, { forexEnabled: true, resetWorldId: "test" }, true);
    const actor = await f.db.collection("characters").findOne({ _id: f.characterId });
    expect(actor?.currencyBalances.personal.USD).toBe(20);
  });
  it("supports imperial recipients and refuses changed replay inputs", async () => {
    const f = fixture("JP", "JPY", 150, "imperialCharacters");
    const credit = {
      characterId: f.characterId,
      ownerCollection: f.ownerCollection,
      currency: "JPY" as const,
      gross: 100,
      income: 100,
    };
    await creditIncomeAfterTax(f.db, "coupon", 2, now, [credit]);
    await expect(
      creditIncomeAfterTax(f.db, "coupon", 2, now, [{ ...credit, gross: 200 }])
    ).rejects.toThrow("Accepted income payout changed");
  });
  it("credits only net interest and keeps bank backing and liabilities consistent", async () => {
    const f = fixture();
    const bankId = new ObjectId();
    f.memory.seed("corporations", [
      { _id: bankId, bankCharter: { cashReserves: 1000, playerDeposits: 1000 } },
    ]);
    f.memory.seed("savingsAccounts", [
      {
        _id: new ObjectId(),
        ownerType: "character",
        ownerId: f.characterId,
        currency: "USD",
        balance: 1000,
      },
    ]);
    await creditIncomeAfterTax(f.db, "interest", 2, now, [
      {
        characterId: f.characterId,
        ownerCollection: f.ownerCollection,
        currency: "USD",
        gross: 100,
        income: 100,
        destination: "currencyBalances.savings.USD",
        interest: { authoritative: true, bankId },
      },
    ]);
    expect(await f.db.collection("corporations").findOne({ _id: bankId })).toMatchObject({
      bankCharter: { cashReserves: 920, playerDeposits: 1020 },
    });
    expect(
      await f.db.collection("savingsAccounts").findOne({ ownerId: f.characterId })
    ).toMatchObject({ balance: 1020 });
    expect(await f.db.collection("characters").findOne({ _id: f.characterId })).toMatchObject({
      currencyBalances: { personal: { USD: 0 }, savings: { USD: 1020 } },
    });
  });
  it.each([
    "characters",
    "playerIncomeTaxAssessments",
    "federalBudget",
    "financialTxLog",
    "playerIncomeTaxBatches",
  ])("rolls back a failure after writing %s and retries once", async (collection) => {
    const f = fixture();
    const operation = collection === "playerIncomeTaxBatches" ? "insertOne" : "bulkWrite";
    const failed = withInjectedCrash(f.memory, {
      collection,
      op: operation,
      afterWrite: true,
      onCall: 1,
    });
    const credit = {
      characterId: f.characterId,
      ownerCollection: f.ownerCollection,
      currency: "USD" as const,
      gross: 100,
      income: 100,
    };
    await expect(creditIncomeAfterTax(failed.db, "salary", 2, now, [credit])).rejects.toThrow();
    expect(await f.db.collection("characters").findOne({ _id: f.characterId })).toMatchObject({
      currencyBalances: { personal: { USD: 0 } },
    });
    expect(
      await f.db.collection("playerIncomeTaxAssessments").findOne({ _id: "old-debt" as never })
    ).toMatchObject({ status: "unpaid" });
    await creditIncomeAfterTax(f.db, "salary", 2, now, [credit]);
    expect(await f.db.collection("characters").findOne({ _id: f.characterId })).toMatchObject({
      currencyBalances: { personal: { USD: 20 } },
    });
  });
  it("collects foreign earnings toward home-country arrears without taxing principal", async () => {
    const f = fixture("UK", "GBP", 0.8);
    f.memory.seed("exchangeRates", [{ _id: "JPY", currencyCode: "JPY", rate: 150 }]);
    const result = await creditIncomeAfterTax(f.db, "foreign-salary", 2, now, [
      {
        characterId: f.characterId,
        ownerCollection: f.ownerCollection,
        currency: "JPY",
        gross: 15000,
        income: 15000,
      },
    ]);
    expect(result[0]).toMatchObject({ currentTax: 4500, arrearsPaid: 9375, net: 1125 });
  });
  it("consumes pending central-bank interest while keeping net liabilities and ledger witnesses aligned", async () => {
    const f = fixture();
    await f.db
      .collection("gameConfig")
      .updateOne({ _id: "default" as never }, { $set: { ledgerShadow: true } });
    await f.db
      .collection("characters")
      .updateOne(
        { _id: f.characterId },
        { $set: { "currencyBalances.pendingSavingsInterest.USD": 100 } }
      );
    f.memory.seed("savingsAccounts", [
      {
        _id: new ObjectId(),
        ownerType: "character",
        ownerId: f.characterId,
        currency: "USD",
        balance: 1000,
        accruedInterest: 100,
      },
    ]);
    f.memory.seed("centralBanks", [{ _id: "US", householdSavingsLiability: 1000 }]);
    await creditIncomeAfterTax(f.db, "central-bank-interest", 2, now, [
      {
        characterId: f.characterId,
        ownerCollection: f.ownerCollection,
        currency: "USD",
        gross: 100,
        income: 100,
        destination: "currencyBalances.savings.USD",
        interest: {
          pendingPath: "currencyBalances.pendingSavingsInterest.USD",
          authoritative: true,
          centralBankId: "US",
        },
      },
    ]);
    expect(await f.db.collection("characters").findOne({ _id: f.characterId })).toMatchObject({
      currencyBalances: { savings: { USD: 1020 }, pendingSavingsInterest: { USD: 0 } },
    });
    expect(
      await f.db.collection("savingsAccounts").findOne({ ownerId: f.characterId })
    ).toMatchObject({ balance: 1020, accruedInterest: 0 });
    expect(await f.db.collection("centralBanks").findOne({ _id: "US" as never })).toMatchObject({
      householdSavingsLiability: 1020,
    });
    const ledger = await f.db.collection("ledgerEntries").find({}).toArray();
    expect(ledger.length).toBe(4);
    for (const entry of ledger)
      expect(
        entry.legs.reduce((sum: number, leg: { anchorAmount: number }) => sum + leg.anchorAmount, 0)
      ).toBeCloseTo(0);
  });
  it("retains one source watermark and rejects a stale payout after the next turn", async () => {
    const f = fixture();
    const credit = {
      characterId: f.characterId,
      ownerCollection: f.ownerCollection,
      currency: "USD" as const,
      gross: 100,
      income: 100,
    };
    await creditIncomeAfterTax(f.db, "salary", 2, now, [credit]);
    await creditIncomeAfterTax(f.db, "salary", 3, now, [credit]);
    expect(
      await f.db.collection("playerIncomeTaxBatches").countDocuments({ kind: "income-payout" })
    ).toBe(1);
    await expect(creditIncomeAfterTax(f.db, "salary", 2, now, [credit])).rejects.toThrow(
      "Stale income payout"
    );
    expect(await f.db.collection("characters").findOne({ _id: f.characterId })).toMatchObject({
      currencyBalances: { personal: { USD: 90 } },
    });
  });
  it("refuses to deduct arrears when their treasury cannot receive the money", async () => {
    const f = fixture();
    await f.db.collection("stateBudgets").deleteMany({});
    await expect(
      creditIncomeAfterTax(f.db, "salary", 2, now, [
        {
          characterId: f.characterId,
          ownerCollection: f.ownerCollection,
          currency: "USD",
          gross: 100,
          income: 100,
        },
      ])
    ).rejects.toThrow("regional treasury unavailable");
    expect(await f.db.collection("characters").findOne({ _id: f.characterId })).toMatchObject({
      currencyBalances: { personal: { USD: 0 } },
    });
  });
  it("keeps database command counts constant as recipient counts grow", async () => {
    const measure = async (count: number) => {
      const f = fixture();
      const original = (await f.db.collection("characters").findOne({ _id: f.characterId }))!;
      const credits = Array.from({ length: count }, () => ({
        characterId: new ObjectId(),
        ownerCollection: "characters" as const,
        currency: "USD" as const,
        gross: 100,
        income: 100,
      }));
      f.memory.seed(
        "characters",
        credits.map((credit) => ({ ...clone(original), _id: credit.characterId }))
      );
      let commands = 0;
      const tracked = {
        collection: (name: string) => {
          const collection = f.memory.collection(name);
          return new Proxy(collection, {
            get(target, property, receiver) {
              const value = Reflect.get(target, property, receiver);
              if (typeof value !== "function") return value;
              return (...args: unknown[]) => {
                commands++;
                return value.apply(target, args);
              };
            },
          });
        },
      } as unknown as Db;
      await creditIncomeAfterTax(tracked, "salary", 2, now, credits);
      return commands;
    };
    expect(await measure(200)).toBe(await measure(2));
  });
  it("includes retained stock income when choosing the legislated earnings tier", async () => {
    const f = fixture();
    await f.db
      .collection("gameState")
      .updateOne({ _id: "current" as never }, { $set: { stockHoldingTaxStartTurn: 0 } });
    await f.db
      .collection("federalBudget")
      .updateOne(
        { _id: "federal" as never },
        { $set: { taxRates: { incomeTaxLow: 0, incomeTaxMiddle: 20, incomeTaxHigh: 40 } } }
      );
    await f.db
      .collection("macroMetrics")
      .updateOne({ _id: "REGION" as never }, { $set: { "economic.medianIncome.value": 10000 } });
    await f.db.collection("characters").updateOne(
      { _id: f.characterId },
      {
        $set: {
          pendingStockTaxReceipts: [
            {
              id: "recent-stock-income",
              version: 1,
              saleTurn: 1,
              assessmentTurn: 1,
              incomeAmount: 10000,
              capitalAmount: 0,
              amount: 10000,
              anchorAmount: 10000,
              currencyCode: "USD",
            },
          ],
        },
      }
    );
    const paid = await creditIncomeAfterTax(f.db, "salary", 2, now, [
      {
        characterId: f.characterId,
        ownerCollection: f.ownerCollection,
        currency: "USD",
        gross: 100,
        income: 100,
      },
    ]);
    expect(paid[0].currentTax).toBe(50);
  });
  it("preserves untaxed legacy payouts before tax enrollment and FX initialization", async () => {
    const f = fixture();
    await f.db
      .collection("characters")
      .updateOne({ _id: f.characterId }, { $unset: { incomeTaxStartTurn: "" } });
    await f.db
      .collection("gameState")
      .updateOne({ _id: "current" as never }, { $set: { forexEnabled: false } });
    await f.db.collection("exchangeRates").deleteMany({});
    await f.db.collection("playerIncomeTaxAssessments").deleteMany({});
    const paid = await creditIncomeAfterTax(f.db, "salary", 2, now, [
      {
        characterId: f.characterId,
        ownerCollection: f.ownerCollection,
        currency: "USD",
        gross: 100,
        income: 100,
      },
    ]);
    expect(paid[0]).toMatchObject({ currentTax: 0, arrearsPaid: 0, net: 100 });
    expect(await f.db.collection("characters").findOne({ _id: f.characterId })).toMatchObject({
      cashOnHand: 100,
    });
  });
});
