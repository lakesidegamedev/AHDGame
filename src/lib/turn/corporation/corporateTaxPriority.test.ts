import { creditCorpDividends } from "./corporationTurnPhases";
import {
  settleCorporateOperatingCash,
  settleCorporateOperatingCashLegacy,
} from "./operatingCashSettlement";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { settleCorporateTaxPriority } from "./corporateTaxPriority";
import type { CorpSnapshot } from "./types";
import { producerCashTransition } from "@/lib/market/producerMarket/cashSettlementRules";
import { atomicallyDebitCorpLiquidCapital } from "@/lib/financialTxLog/atomicCashGuard";
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
function fixture(country = "US", currency = "USD", fx = 1) {
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
  const id = new ObjectId();
  memory.seed("gameConfig", [{ _id: "default", treasuryCashLedgerEnabled: true }]);
  memory.seed("gameState", [{ _id: "current", preset: "2019-default", currentTurn: 4 }]);
  memory.seed("exchangeRates", [{ currencyCode: currency, rate: fx }]);
  memory.seed("federalBudget", [
    {
      _id: country,
      countryId: country,
      currencyCode: currency,
      treasuryCashLocal: 0,
      treasuryBalance: 0,
    },
  ]);
  memory.seed("corporations", [
    {
      _id: id,
      liquidCapital: 100 * fx,
      pendingOperatingCash: 0,
      federalTaxArrearsAnchorByCountry: { [country]: 50 },
      operatingCashArrearsByCurrency: { [currency]: 20 * fx },
    },
  ]);
  const snapshot = {
    corpId: id,
    operatingCashIncomeLocal: 80 * fx,
    operatingCashCurrency: currency,
    operatingCashLocalPerAnchor: fx,
    federalTaxByCountryAnchor: new Map([[country, 20]]),
  } as CorpSnapshot;
  return { memory, db: memory as unknown as Db, id, snapshot };
}
describe("corporate tax-first settlement", () => {
  it.each([
    ["US", "USD", 1],
    ["UK", "GBP", 0.8],
    ["JP", "JPY", 150],
  ] as const)("settles and replays %s exactly once", async (country, currency, fx) => {
    const f = fixture(country, currency, fx);
    await settleCorporateTaxPriority(f.db, [f.snapshot], 4, now);
    await settleCorporateTaxPriority(f.db, [f.snapshot], 4, now);
    expect(await f.db.collection("corporations").findOne({ _id: f.id })).toMatchObject({
      liquidCapital: 110 * fx,
      pendingOperatingCash: 0,
      federalTaxArrearsAnchorByCountry: { [country]: 0 },
      operatingCashArrearsByCurrency: { [currency]: 0 },
    });
    expect(await f.db.collection("federalBudget").findOne({ countryId: country })).toMatchObject({
      treasuryCashLocal: 70 * fx,
      treasuryBalance: 70 * fx,
    });
    for (const entry of await f.db.collection("ledgerEntries").find({}).toArray())
      expect(
        entry.legs.reduce((sum: number, leg: { anchorAmount: number }) => sum + leg.anchorAmount, 0)
      ).toBeCloseTo(0);
  });
  it("holds funded-market receipts out of spendable liquid capital", () => {
    const id = new ObjectId().toHexString();
    const rule = producerCashTransition({
      worldEpoch: "test",
      turn: 4,
      receiptDigest: "a".repeat(64),
      opening: [
        { id, cash: 0 },
        { id: "buyer", cash: 100 },
      ],
      closing: [
        { id, cash: 100 },
        { id: "buyer", cash: 0 },
      ],
      bindings: [
        {
          kind: "corporation",
          corporationId: id,
          accountId: id,
          currency: "USD",
          localPerAnchor: 1,
          openingCashLocal: 0,
          deferCredit: true,
        },
        {
          kind: "economyAccount",
          economyAccountId: "buyer",
          accountId: "buyer",
          currency: "USD",
          localPerAnchor: 1,
          openingCashLocal: 100,
        },
      ],
    });
    expect(rule.legs.find((leg) => leg.collection === "corporations")).toMatchObject({
      path: "pendingOperatingCash",
      amount: 100,
    });
  });
  it("blocks discretionary spending against tax arrears or held income", async () => {
    const f = fixture();
    expect((await atomicallyDebitCorpLiquidCapital(f.db, f.id, 1)).ok).toBe(false);
    await f.db.collection("corporations").updateOne(
      { _id: f.id },
      {
        $set: {
          federalTaxArrearsAnchorByCountry: {},
          operatingCashArrearsByCurrency: {},
          pendingOperatingCash: 50,
        },
      }
    );
    expect((await atomicallyDebitCorpLiquidCapital(f.db, f.id, 1)).ok).toBe(false);
    expect(
      (await atomicallyDebitCorpLiquidCapital(f.db, f.id, 1, { corporateObligation: true })).ok
    ).toBe(true);
  });
  it("funds an AI household distribution only after withholding and prior debts", async () => {
    const f = fixture();
    await f.db
      .collection("corporations")
      .updateOne({ _id: f.id }, { $set: { liquidCapital: 0, pendingOperatingCash: 100 } });
    f.memory.seed("producerEconomyAccounts", [
      { _id: "household", worldEpoch: "test", currency: "USD", cash: 0 },
    ]);
    const snapshot = {
      ...f.snapshot,
      operatingCashIncomeLocal: -20,
      deferredProducerDistributions: [
        {
          walletId: "household",
          worldEpoch: "test",
          currency: "USD" as const,
          localPerAnchor: 1,
          amountAnchor: 60,
        },
      ],
    };
    await settleCorporateTaxPriority(f.db, [snapshot], 4, now);
    expect(await f.db.collection("corporations").findOne({ _id: f.id })).toMatchObject({
      liquidCapital: 0,
      pendingOperatingCash: 0,
    });
    expect(
      await f.db.collection("producerEconomyAccounts").findOne({ _id: "household" as never })
    ).toMatchObject({ cash: 10 });
  });
});

it.each(["corporations", "federalBudget", "ledgerEntries", "bankMoneyMoves"])(
  "rolls back failed %s settlement writes and retries once",
  async (collection) => {
    const f = fixture();
    const faulty = withInjectedCrash(f.memory, {
      collection,
      op: "bulkWrite",
      onCall: 1,
      afterWrite: true,
    });
    await expect(settleCorporateTaxPriority(faulty.db, [f.snapshot], 4, now)).rejects.toThrow();
    expect(await f.db.collection("corporations").findOne({ _id: f.id })).toMatchObject({
      liquidCapital: 100,
      federalTaxArrearsAnchorByCountry: { US: 50 },
    });
    expect(await f.db.collection("federalBudget").findOne({ countryId: "US" })).toMatchObject({
      treasuryCashLocal: 0,
    });
    expect(await f.db.collection("ledgerEntries").countDocuments({})).toBe(0);
    expect(await f.db.collection("bankMoneyMoves").countDocuments({})).toBe(0);
    faulty.disarm();
    await settleCorporateTaxPriority(faulty.db, [f.snapshot], 4, now);
    await settleCorporateTaxPriority(faulty.db, [f.snapshot], 4, now);
    expect(await f.db.collection("corporations").findOne({ _id: f.id })).toMatchObject({
      liquidCapital: 110,
    });
  }
);

it("settles operating income and corporate dividends using separate retry receipts", async () => {
  const f = fixture();
  await settleCorporateTaxPriority(f.db, [f.snapshot], 4, now);
  const dividend = {
    ...f.snapshot,
    operatingCashIncomeLocal: 90,
    federalTaxByCountryAnchor: new Map([["US", 10]]),
  };
  await settleCorporateTaxPriority(f.db, [dividend], 4, now, "dividend");
  await settleCorporateTaxPriority(f.db, [dividend], 4, now, "dividend");
  expect(await f.db.collection("corporations").findOne({ _id: f.id })).toMatchObject({
    liquidCapital: 200,
  });
  expect(await f.db.collection("federalBudget").findOne({ countryId: "US" })).toMatchObject({
    treasuryCashLocal: 80,
  });
  expect(await f.db.collection("bankMoneyMoves").countDocuments({})).toBe(2);
});
it("distributes the residual to every regional household wallet", async () => {
  const f = fixture();
  f.memory.seed(
    "producerEconomyAccounts",
    ["one", "two"].map((_id) => ({ _id, worldEpoch: "test", currency: "USD", cash: 0 }))
  );
  await settleCorporateTaxPriority(
    f.db,
    [
      {
        ...f.snapshot,
        deferredProducerDistributions: [
          {
            walletId: "one",
            worldEpoch: "test",
            currency: "USD",
            localPerAnchor: 1,
            amountAnchor: 40,
          },
          {
            walletId: "two",
            worldEpoch: "test",
            currency: "USD",
            localPerAnchor: 1,
            amountAnchor: 80,
          },
        ],
      },
    ],
    4,
    now
  );
  expect(
    await f.db.collection("producerEconomyAccounts").findOne({ _id: "one" as never })
  ).toMatchObject({ cash: 110 / 3 });
  expect(
    (await f.db.collection("producerEconomyAccounts").findOne({ _id: "two" as never }))?.cash
  ).toBeCloseTo(220 / 3);
});

it("routes a fresh operating settlement through tax-first withholding", async () => {
  const f = fixture();
  await settleCorporateOperatingCash(f.db, [f.snapshot], 4, now);
  expect(
    await f.db
      .collection("bankMoneyMoves")
      .findOne({ _id: `corporate-tax-priority:4:${f.id}` as never })
  ).toMatchObject({ status: "applied" });
});
it("retains the old protocol when resuming existing operating receipts", async () => {
  const f = fixture();
  await settleCorporateOperatingCashLegacy(f.db, [f.snapshot], 4, now, 1);
  const cash = (await f.db.collection("corporations").findOne({ _id: f.id }))?.liquidCapital;
  await settleCorporateOperatingCash(f.db, [f.snapshot], 4, now);
  expect((await f.db.collection("corporations").findOne({ _id: f.id }))?.liquidCapital).toBe(cash);
  expect(
    await f.db
      .collection("bankMoneyMoves")
      .findOne({ _id: `corporate-tax-priority:4:${f.id}` as never })
  ).toBeNull();
});

it("withholds corporate dividend tax and services old payables before the recipient spends it", async () => {
  const f = fixture();
  const recipient = {
    _id: f.id,
    countryId: "US",
    liquidCurrencyCode: "USD",
    name: "Test corporation",
  };
  await creditCorpDividends({
    db: f.db,
    lookups: {
      corpById: new Map([[f.id.toHexString(), recipient]]),
      exchangeRatesByCurrency: new Map([["USD", 1]]),
      domesticCorpTaxRateByCountry: new Map([["US", 20]]),
    } as never,
    corpDividendPaymentsAnchorByCorpId: new Map([[f.id.toHexString(), 100]]),
    corpDividendPaymentsAnchorByCorpCurrency: new Map(),
    corpDividendTaxedAtSourceAnchorByCorpId: new Map(),
    turn: 4,
    now,
    thresholds: {} as never,
  });
  expect(await f.db.collection("corporations").findOne({ _id: f.id })).toMatchObject({
    liquidCapital: 120,
  });
  expect(await f.db.collection("federalBudget").findOne({ countryId: "US" })).toMatchObject({
    treasuryCashLocal: 60,
  });
});
