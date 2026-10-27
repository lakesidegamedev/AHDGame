/**
 * The operating-loss wave against the protocol it replaces.
 *
 * A corporation whose cash cannot fund its net used to settle through three
 * receipts: a loss, a withholding its own guard refused, and a payable. The
 * wave pays every loss and states every payable in one move per currency. What
 * must not move is money: the same cash, the same payables, the same Treasury
 * balance, and the same outcome when the pass is interrupted at any write and
 * resumed.
 */
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash, type FaultPlan } from "@/lib/test-utils/faultyDb";
import type { CorpSnapshot } from "./types";
import { settleCorporateOperatingCash } from "./operatingCashSettlement";

const TURN = 458;
const NOW = new Date("2026-10-27T03:00:00Z");

/**
 * The cohort, one row per shape the pass branches on. `tax` is the federal
 * withholding in anchor units; every corporation withholds it for its own
 * country.
 */
const COHORT = [
  // Cash cannot fund the loss, and some cash is there to pay: the wave pays it
  // and records the rest as a payable.
  ...Array.from({ length: 8 }, () => ({
    country: "US",
    currency: "USD" as const,
    rate: 1,
    net: -25,
    tax: 5,
    cash: 2,
  })),
  // No cash at all: nothing to debit, so the payables keep their own projection.
  ...Array.from({ length: 4 }, () => ({
    country: "US",
    currency: "USD" as const,
    rate: 1,
    net: -100,
    tax: 5,
    cash: 0,
  })),
  // Funded: the net batch credits the whole net and pays the Treasury the tax.
  ...Array.from({ length: 3 }, () => ({
    country: "UK",
    currency: "GBP" as const,
    rate: 0.8,
    net: 12,
    tax: 5,
    cash: 40,
  })),
  // Funded loss: the net batch debits the net and burns the shortfall.
  ...Array.from({ length: 2 }, () => ({
    country: "FR",
    currency: "EUR" as const,
    rate: 1.1,
    net: -8,
    tax: 5,
    cash: 60,
  })),
];

function snapshot(
  corpId: ObjectId,
  input: Pick<
    CorpSnapshot,
    | "operatingCashIncomeLocal"
    | "operatingCashCurrency"
    | "operatingCashLocalPerAnchor"
    | "federalTaxByCountryAnchor"
  >
): CorpSnapshot {
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
    taxPaidByCountry: input.federalTaxByCountryAnchor,
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

const RATES: Record<string, number> = { US: 1, UK: 0.8, FR: 1.1, IT: 1.1 };

const TREASURIES = [
  { country: "US", currency: "USD" },
  { country: "UK", currency: "GBP" },
  { country: "FR", currency: "EUR" },
  { country: "IT", currency: "EUR" },
] as const;

function fixture() {
  const db = createInMemoryDb();
  db.seed("gameConfig", [{ _id: "default", treasuryCashLedgerEnabled: true }]);
  db.seed("gameState", [{ _id: "current", currentTurn: TURN, preset: "2019-default" }]);
  db.seed(
    "exchangeRates",
    TREASURIES.map((row) => ({ currencyCode: row.currency, rate: RATES[row.country] }))
  );
  db.seed(
    "federalBudget",
    TREASURIES.map((row) => ({
      _id: new ObjectId(),
      countryId: row.country,
      currencyCode: row.currency,
      treasuryCashLocal: 1000,
      treasuryBalance: -100,
    }))
  );
  const corps: Record<string, unknown>[] = [];
  const snapshots: CorpSnapshot[] = [];
  let n = 0;
  const add = (row: (typeof COHORT)[number], priorArrears?: number) => {
    const id = new ObjectId(`${String(n).padStart(8, "0")}2000000000000000`);
    n += 1;
    corps.push({
      _id: id,
      liquidCapital: row.cash,
      ...(priorArrears
        ? { federalTaxArrearsAnchorByCountry: { [row.country]: priorArrears } }
        : {}),
    });
    snapshots.push(
      snapshot(id, {
        operatingCashIncomeLocal: row.net,
        operatingCashCurrency: row.currency,
        operatingCashLocalPerAnchor: row.rate,
        federalTaxByCountryAnchor: new Map([[row.country, row.tax]]),
      })
    );
    return id;
  };
  for (const row of COHORT) add(row);
  // Already owing a payable: it keeps the ordered per-corporation receipts.
  add({ country: "IT", currency: "EUR", rate: 1, net: -25, tax: 5, cash: 3 }, 7);
  db.seed("corporations", corps);
  return { db, snapshots };
}

/** Every field settlement may touch, in a stable order, for comparison. */
function stateOf(db: ReturnType<typeof createInMemoryDb>) {
  const money = (value: unknown) =>
    typeof value === "number" ? Math.round(value * 1e6) / 1e6 : value;
  const round = (row: Record<string, unknown> | undefined) =>
    row && Object.fromEntries(Object.entries(row).map(([key, value]) => [key, money(value)]));
  return {
    corporations: db
      .collection("corporations")
      .docs.map((row) => ({
        id: String(row._id),
        liquidCapital: money(row.liquidCapital),
        operatingCashArrearsByCurrency: round(
          row.operatingCashArrearsByCurrency as Record<string, unknown> | undefined
        ),
        operatingCashArrearsLastTurnByCurrency: row.operatingCashArrearsLastTurnByCurrency,
        federalTaxArrearsAnchorByCountry: round(
          row.federalTaxArrearsAnchorByCountry as Record<string, unknown> | undefined
        ),
        federalTaxArrearsLastTurnByCountry: row.federalTaxArrearsLastTurnByCountry,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    treasury: db
      .collection("federalBudget")
      .docs.map((row) => ({
        country: row.countryId,
        treasuryCashLocal: money(row.treasuryCashLocal),
        treasuryBalance: money(row.treasuryBalance),
      }))
      .sort((a, b) => String(a.country).localeCompare(String(b.country))),
    journal: db
      .collection("bankMoneyMoves")
      .docs.map((row) => `${String(row.kind)}:${String(row.status)}`)
      .sort(),
  };
}

async function settle(db: ReturnType<typeof createInMemoryDb>, snapshots: CorpSnapshot[]) {
  await settleCorporateOperatingCash(db as unknown as Db, snapshots, TURN, NOW, 1);
}

describe("operating loss wave", () => {
  it("leaves the same cash, payables and Treasury balances as the serial receipts", async () => {
    const { db, snapshots } = fixture();
    await settle(db, snapshots);
    const rows = db.collection("corporations").docs;
    const cash = rows.map((row) => row.liquidCapital);
    const arrears = rows.map(
      (row) => (row.operatingCashArrearsByCurrency as Record<string, number> | undefined)?.USD
    );
    const taxArrears = rows.map(
      (row) => (row.federalTaxArrearsAnchorByCountry as Record<string, number> | undefined)?.US
    );
    // 8 corporations paying the 2 they hold against a 25 loss, 4 with nothing.
    expect(cash.slice(0, 12)).toEqual(Array.from({ length: 12 }, () => 0));
    expect(arrears.slice(0, 8)).toEqual(Array.from({ length: 8 }, () => 18));
    expect(arrears.slice(8, 12)).toEqual(Array.from({ length: 4 }, () => 95));
    // Their withholding of 5 anchor is a payable, never a Treasury receipt.
    expect(taxArrears.slice(0, 12)).toEqual(Array.from({ length: 12 }, () => 5));
    expect(db.collection("federalBudget").docs.find((row) => row.countryId === "US")).toMatchObject(
      { treasuryCashLocal: 1000, treasuryBalance: -100 }
    );
    // Funded: UK keeps its net of 12 and pays 4 into its Treasury; France pays
    // its 8 loss and 5.5 of withholding, burning the 2.5 its receipts missed.
    expect(cash.slice(12, 15)).toEqual([52, 52, 52]);
    expect(cash.slice(15, 17)).toEqual([52, 52]);
    expect(db.collection("federalBudget").docs.find((row) => row.countryId === "UK")).toMatchObject(
      { treasuryCashLocal: 1012, treasuryBalance: -88 }
    );
    expect(db.collection("federalBudget").docs.find((row) => row.countryId === "FR")).toMatchObject(
      { treasuryCashLocal: 1011, treasuryBalance: -89 }
    );
    expect(db.collection("bankMoneyMoves").docs.map((row) => String(row.kind))).toEqual(
      expect.arrayContaining(["corporate_operating_loss_batch", "corporate_operating_net_batch"])
    );
  });

  it("settles nothing twice when the pass runs again", async () => {
    const { db, snapshots } = fixture();
    await settle(db, snapshots);
    const first = stateOf(db);
    await settle(db, snapshots);
    const second = stateOf(db);
    expect(
      JSON.stringify(second) === JSON.stringify(first),
      `first ${JSON.stringify(first)} second ${JSON.stringify(second)}`
    ).toBe(true);
  });

  const stops: FaultPlan[] = [
    // Before the book is claimed: nothing moved, the retry claims it.
    { collection: "bankMoneyMoves", op: "insertOne", onCall: 1 },
    // After the claim: the resumed pass finishes the frozen legs.
    { collection: "bankMoneyMoves", op: "insertOne", onCall: 1, afterWrite: true },
    // After the guarded debits landed, before the completion write.
    { collection: "corporations", op: "bulkWrite", onCall: 1, afterWrite: true },
    // After the completion write, before the payables.
    { collection: "bankMoneyMoves", op: "updateOne", onCall: 1, afterWrite: true },
    // Within the payable projections.
    { collection: "corporations", op: "updateOne", onCall: 1, afterWrite: true },
    { collection: "corporations", op: "updateOne", onCall: 2, afterWrite: true },
  ];

  for (const plan of stops) {
    it(`resumes to the same state after a crash at ${plan.collection}.${plan.op}#${plan.onCall}${plan.afterWrite ? " (after write)" : ""}`, async () => {
      const clean = fixture();
      await settle(clean.db, clean.snapshots);
      const expected = stateOf(clean.db);

      const { db, snapshots } = fixture();
      const fault = withInjectedCrash(db, plan);
      await expect(settle(fault.db as never, snapshots)).rejects.toThrow();
      fault.disarm();
      await settle(db, snapshots);
      // A second retry proves the resumed receipts are terminal.
      await settle(db, snapshots);
      const actual = stateOf(db);
      expect(
        JSON.stringify(actual) === JSON.stringify(expected),
        `expected ${JSON.stringify(expected)} actual ${JSON.stringify(actual)}`
      ).toBe(true);
    });
  }
});
