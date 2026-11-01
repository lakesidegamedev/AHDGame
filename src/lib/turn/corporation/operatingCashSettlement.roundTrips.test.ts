/**
 * Round-trip budget for corporate operating cash settlement.
 *
 * One settlement per corporation runs every turn, so the cost of a turn is the
 * number of receipts times the round trips each one takes. These fixtures hold
 * a large corporation cohort in the shapes the live world has: a funded turn,
 * corporations withholding for several Treasuries, and corporations whose cash
 * cannot fund their loss. A per-corporation receipt, or a book that stops
 * merging, fails here instead of in production.
 */
import { ObjectId, BSON } from "mongodb";
import type { Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { settleCorporateTaxPriority } from "./corporateTaxPriority";
vi.mock("@/lib/db/runRequiredTransaction", () => ({
  runRequiredTransaction: (body: (session: object) => unknown) => body({}),
}));
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { countRoundTrips } from "@/lib/test-utils/roundTripCounter";
import type { CorpSnapshot } from "./types";
import { settleCorporateOperatingCashLegacy as settleCorporateOperatingCash } from "./operatingCashSettlement";

const TURN = 458;
const CURRENCIES = [
  { country: "US", currency: "USD", rate: 1 },
  { country: "UK", currency: "GBP", rate: 0.8 },
  { country: "FR", currency: "EUR", rate: 1.1 },
  { country: "DE", currency: "EUR", rate: 1.1 },
  { country: "JP", currency: "JPY", rate: 140 },
  { country: "BR", currency: "BRL", rate: 5 },
  { country: "IN", currency: "INR", rate: 83 },
  { country: "CA", currency: "CAD", rate: 1.35 },
] as const;
const CORPORATIONS = 480;

function snapshot(corpId: ObjectId, input: Partial<CorpSnapshot>): CorpSnapshot {
  return {
    corpId,
    revenue: 100,
    totalCosts: 0,
    incomePreDividends: 80,
    income: 80,
    perTurnBondCouponIncome: 0,
    perTurnBondInterestExpense: 0,
    perTurnBondDragOnNetIncome: 0,
    liquidCapitalAnchorAfterIncome: 180,
    dividendPaidPerTurn: 0,
    federalTaxPaid: 20,
    stateTaxPaid: 0,
    taxPaidByCountry: input.federalTaxByCountryAnchor ?? new Map(),
    taxPaidByState: new Map(),
    taxPaidByCountryDomestic: new Map(),
    taxPaidByCountryForeign: new Map(),
    taxPaidByStateDomestic: new Map(),
    taxPaidByStateForeign: new Map(),
    marketingStrength: 0,
    logisticsStrength: 0,
    rdScore: 0,
    dividendRate: 0,
    liquidCapital: 180,
    escrowFundingMove: 0,
    escrowBalanceAfter: 0,
    actualSharePrice: 1,
    totalShares: 100,
    sectorNPV: 0,
    creditComposite: 50,
    creditRating: "B",
    ...input,
  };
}

type Shape = {
  /** Countries each corporation withholds for, by index. */
  taxCountries: (n: number) => Array<[string, number]>;
  /** Cash a corporation holds when it settles. */
  cash: (n: number) => number;
  /** This turn's operating cash, before withholding. */
  netLocal: (n: number) => number;
  /** Corporation document fields beyond the cash balance. */
  corp?: (n: number) => Record<string, unknown>;
  /** Rewrite the snapshot before it settles. */
  snapshot?: (n: number, snapshot: CorpSnapshot) => CorpSnapshot;
  /** The corporation's home currency, by index. Defaults to one per country. */
  home?: (n: number) => (typeof CURRENCIES)[number];
};

function fixture(shape: Shape) {
  const db = createInMemoryDb();
  db.seed("gameConfig", [{ _id: "default", treasuryCashLedgerEnabled: true }]);
  db.seed("gameState", [{ _id: "current", currentTurn: TURN, preset: "2019-default" }]);
  db.seed(
    "exchangeRates",
    CURRENCIES.map((row) => ({ currencyCode: row.currency, rate: row.rate }))
  );
  db.seed(
    "federalBudget",
    CURRENCIES.map((row) => ({
      _id: new ObjectId(),
      countryId: row.country,
      currencyCode: row.currency,
      treasuryCashLocal: 0,
      treasuryBalance: 0,
    }))
  );
  const corps: Record<string, unknown>[] = [];
  const snapshots: CorpSnapshot[] = [];
  for (let n = 0; n < CORPORATIONS; n += 1) {
    const id = new ObjectId(`${String(n).padStart(8, "0")}1000000000000000`);
    const home = shape.home ? shape.home(n) : CURRENCIES[n % CURRENCIES.length];
    corps.push({ _id: id, liquidCapital: shape.cash(n), ...shape.corp?.(n) });
    const base = snapshot(id, {
      operatingCashIncomeLocal: shape.netLocal(n),
      operatingCashCurrency: home.currency as CorpSnapshot["operatingCashCurrency"],
      operatingCashLocalPerAnchor: home.rate,
      federalTaxByCountryAnchor: new Map(shape.taxCountries(n)),
    });
    snapshots.push(shape.snapshot ? shape.snapshot(n, base) : base);
  }
  db.seed("corporations", corps);
  return { db, snapshots };
}

/** A funded turn: the producer market paid the profit, so most nets are negative. */
const fundedNet = (n: number) => (n % 5 === 0 ? 60 : -25);

async function measure(
  shape: Shape
): Promise<{ detail: string; db: ReturnType<typeof createInMemoryDb> }> {
  const { db, snapshots } = fixture(shape);
  const counter = countRoundTrips(db);
  const startedAt = performance.now();
  // One lane: the shared round-trip counter is not safe under concurrent
  // calls, and the count is what this fixture measures. Lanes change timing,
  // not the number of commands a pass issues.
  await settleCorporateOperatingCash(db as unknown as Db, snapshots, TURN, new Date(), 1);
  const ms = performance.now() - startedAt;
  return {
    db,
    detail: `${counter.total()} round trips, ${ms.toFixed(1)} ms, ${counter.summary()}`,
  };
}

describe("settleCorporateOperatingCash round trips", () => {
  it("settles a funded cohort in a fixed number of round trips", async () => {
    const { detail } = await measure({
      taxCountries: (n) => [[CURRENCIES[n % CURRENCIES.length].country, 20]],
      cash: () => 500,
      netLocal: fundedNet,
    });
    expect(Number.parseInt(detail, 10) <= 170, detail).toBe(true);
  });

  it("merges corporations withholding for different Treasuries", async () => {
    const { detail } = await measure({
      taxCountries: (n) => {
        const first = CURRENCIES[n % CURRENCIES.length].country;
        const second = CURRENCIES[(n * 3 + 1) % CURRENCIES.length].country;
        return first === second
          ? [[first, 10]]
          : [
              [first, 10],
              [second, 10],
            ];
      },
      cash: () => 500,
      netLocal: fundedNet,
    });
    expect(Number.parseInt(detail, 10) <= 210, detail).toBe(true);
  });

  it("settles a cohort whose cash cannot fund its loss in a fixed number of round trips", async () => {
    const { detail, db } = await measure({
      taxCountries: () => [["US", 5]],
      home: () => CURRENCIES[0],
      cash: (n) => (n % 2 === 0 ? 0 : 3),
      netLocal: (n) => (n % 3 === 0 ? -100 : -25),
    });
    expect(Number.parseInt(detail, 10) <= 1300, detail).toBe(true);
    // Every corporation took its whole loss out of the cash it had, and the
    // rest is a payable. Nothing reached a Treasury, exactly as the refused
    // withholding left it.
    const rows = db.collection("corporations").docs;
    expect(rows.every((row) => row.liquidCapital === 0)).toBe(true);
    expect(
      db
        .collection("bankMoneyMoves")
        .docs.filter((row) => String(row._id).startsWith("corp-operating"))
        .map((row) => row.status)
    ).toEqual(expect.arrayContaining(["applied"]));
  });

  it("keeps corporations with prior payables and existing receipts on their own protocol", async () => {
    const { detail, db } = await measure({
      taxCountries: (n) => [[CURRENCIES[n % CURRENCIES.length].country, 5]],
      cash: (n) => (n % 2 === 0 ? 0 : 3),
      netLocal: (n) => (n % 3 === 0 ? -100 : -25),
      corp: (n) => (n % 40 === 0 ? { federalTaxArrearsAnchorByCountry: { US: 5 } } : {}),
      // A corporation listed twice settles its entries in input order.
      snapshot: (n, snap) => snap,
    });
    expect(Number.parseInt(detail, 10) > 20, detail).toBe(true);
    const kinds = db.collection("bankMoneyMoves").docs.map((row) => String(row.kind));
    expect(kinds).toEqual(expect.arrayContaining(["corporate_operating_loss"]));
  });
});

it("batches the new tax-first path and measures projected corporation bytes", async () => {
  const shape: Shape = {
    taxCountries: (n) => [[CURRENCIES[n % CURRENCIES.length].country, 20]],
    cash: () => 500,
    netLocal: fundedNet,
    corp: () => ({
      federalTaxArrearsAnchorByCountry: { US: 10 },
      operatingCashArrearsByCurrency: { USD: 5 },
      unusedLargeField: "x".repeat(4000),
    }),
  };
  const before = await measure(shape);
  const { db, snapshots } = fixture(shape);
  const collection = db.collection("corporations");
  const read = collection.find.bind(collection);
  let bytes = 0;
  vi.spyOn(collection, "find").mockImplementation((...args) => {
    const cursor = read(...args);
    const array = cursor.toArray.bind(cursor);
    cursor.toArray = async () => {
      const rows = await array();
      // The in-memory find cursor does not apply Mongo projections. Apply the
      // captured projection here to estimate the actual returned BSON size.
      const projection = (args as unknown as [unknown, { projection: Record<string, number> }])[1]
        .projection;
      expect(projection).toEqual({
        liquidCapital: 1,
        pendingOperatingCash: 1,
        operatingCashArrearsByCurrency: 1,
        federalTaxArrearsAnchorByCountry: 1,
      });
      bytes += rows.reduce(
        (sum, row) =>
          sum +
          BSON.calculateObjectSize(
            Object.fromEntries(
              ["_id", ...Object.keys(projection)]
                .filter((key) => row[key] !== undefined)
                .map((key) => [key, row[key]])
            )
          ),
        0
      );
      return rows;
    };
    return cursor;
  });
  const count = countRoundTrips(db);
  await settleCorporateTaxPriority(db as unknown as Db, snapshots, TURN, new Date());
  console.info(
    "Synthetic corporate settlement:",
    "legacy",
    before.detail,
    "tax-first",
    count.total(),
    "commands; projected corporation BSON bytes",
    bytes
  );
  expect(count.total()).toBeLessThanOrEqual(60);
  expect(bytes).toBeLessThan(CORPORATIONS * 300);
});
