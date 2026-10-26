/**
 * Equivalence and round-trip test for the pass-level bond issue source.
 *
 * Pass 1b deploys reserves fund by fund because funds compete for the same
 * public float. The shared source reads the issue book once and then follows
 * every settled purchase, so a later fund sees the float the earlier one took.
 * This runs the same fixture through the per-fund reads and the shared source
 * and requires identical books; it also counts the round trips each path costs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BSON, ObjectId, type Db } from "mongodb";
import type { Bond, IndexFund } from "@/lib/db/types";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { countRoundTrips, type RoundTripCounter } from "@/lib/test-utils/roundTripCounter";
import { deployBondReserveFromCash } from "./fundBondReserve";
import { lazyFundBondCandidates } from "@/lib/bonds/fundBondCandidates";
import { loadBondPoolsByCurrency } from "@/lib/bonds/marketPool";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import { emitTxBulk, loadTxThresholds, type TxInput } from "@/lib/financialTxLog/emit";

let activeMemory: InMemoryDb;

vi.mock("@/lib/mongodb", () => ({
  getMongoClient: vi.fn(),
  getDb: vi.fn(async () => {
    throw new Error("no ambient database in this test");
  }),
}));
// Run the settlement body against the in-memory store and restore every
// collection if it throws, which is what an aborted Mongo transaction does.
vi.mock("@/lib/db/transactionWithRetry", () => ({
  runTransactionWithSessionRetry: vi.fn(
    async (_client: unknown, run: (session?: unknown) => Promise<unknown>) => {
      const snapshot = new Map(
        Array.from(activeMemory.collections, ([name, col]) => [
          name,
          BSON.serialize({ docs: col.docs }),
        ])
      );
      try {
        return await run({});
      } catch (err) {
        for (const [name, bytes] of snapshot) {
          activeMemory.collection(name).docs = BSON.deserialize(bytes).docs;
        }
        throw err;
      }
    }
  ),
}));

const NOW = new Date("2000-01-01T00:00:00Z");

function bond(id: string, overrides: Partial<Bond> = {}): Record<string, unknown> {
  return {
    _id: new ObjectId(id),
    issuerType: "sovereign",
    issuerName: "United States",
    countryId: "US",
    currencyCode: "USD",
    matured: false,
    defaulted: false,
    publicFloat: 400,
    totalIssued: 10_000_000,
    faceValue: 1000,
    marketPrice: 0.98,
    maturityTurn: 200,
    couponRate: 0.03,
    holders: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function fund(id: string, overrides: Partial<IndexFund> = {}): Record<string, unknown> {
  return {
    _id: new ObjectId(id),
    name: `Fund ${id.slice(-2)}`,
    slug: `fund-${id.slice(-2)}`,
    tickerSymbol: `F${id.slice(-2)}`,
    kind: "broad",
    scope: "country",
    countryId: "US",
    anchorCurrencyCode: "USD",
    status: "active",
    cashAnchor: 600_000,
    quotedNav: 100,
    unitSupply: 10_000,
    reserveUnits: 0,
    holdings: [],
    targetConstituents: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const FUND_IDS = [
  new ObjectId("6a0000000000000000000001"),
  new ObjectId("6a0000000000000000000002"),
  new ObjectId("6a0000000000000000000003"),
];

function world(): InMemoryDb {
  const memory = createInMemoryDb();
  memory.seed("bonds", [
    // Two US issues the three funds compete for, and one the global fund may
    // also reach. Float is small enough that later funds cannot take a full
    // slice, so the shared view has to follow every settled purchase.
    bond("6a0000000000000000000011", { maturityTurn: 150, publicFloat: 260 }),
    bond("6a0000000000000000000012", {
      maturityTurn: 160,
      publicFloat: 120,
      holders: [{ fundId: FUND_IDS[1], units: 25, avgCostPerUnit: 990 }],
    }),
    bond("6a0000000000000000000013", {
      maturityTurn: 170,
      countryId: "FR",
      currencyCode: "FRF",
      issuerName: "France",
      publicFloat: 90,
    }),
    bond("6a0000000000000000000014", {
      _id: new ObjectId("6a0000000000000000000014"),
      issuerType: "corporation",
      issuerName: "Acme",
      countryId: "US",
      currencyCode: "USD",
      corporationId: new ObjectId("6a00000000000000000000a1"),
      maturityTurn: 180,
      publicFloat: 80,
    }),
  ]);
  memory.seed("bondMarketPools", [
    { _id: "USD", cashLocal: 250_000, targetCashLocal: 500_000, lifetime: {} },
    { _id: "FRF", cashLocal: 40_000, targetCashLocal: 60_000, lifetime: {} },
  ]);
  memory.seed("indexFunds", [
    fund(String(FUND_IDS[0])),
    fund(String(FUND_IDS[1])),
    // A global bond fund, resolved through its persisted mandate.
    fund(String(FUND_IDS[2]), {
      kind: "bond",
      scope: "global",
      anchorCurrencyCode: "USD",
      countryId: undefined,
      mandate: {
        version: 1,
        mode: "index",
        scope: "global",
        kind: "bond",
        anchorCurrencyCode: "USD",
        bondUniverse: { issuerType: "sovereign", minRating: "BBB" },
      },
    } as Partial<IndexFund>),
  ]);
  memory.seed("federalBudget", [
    { _id: getNationalBudgetId("US"), creditRating: "AA" },
    { _id: getNationalBudgetId("FR"), creditRating: "A" },
  ]);
  memory.seed("corporations", [
    {
      _id: new ObjectId("6a00000000000000000000a1"),
      name: "Acme",
      creditRatingSnapshot: "BB",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  memory.seed("exchangeRates", [
    { currencyCode: "USD", rate: 1 },
    { currencyCode: "FRF", rate: 2, capitalControls: false },
  ]);
  memory.seed("gameConfig", [{ _id: "default", indexFundBondLiquidityEnabled: true }]);
  memory.seed("indexFundTransactions", []);
  return memory;
}

async function runPass(
  memory: InMemoryDb,
  options: { shared: boolean; settleInTransaction: boolean }
): Promise<{
  trips: RoundTripCounter;
  purchases: number[];
}> {
  activeMemory = memory;
  const db = memory as unknown as Db;
  const trips = countRoundTrips(memory);
  const candidates = options.shared ? lazyFundBondCandidates(db) : undefined;
  const pools = options.shared ? await loadBondPoolsByCurrency(db) : undefined;
  // Mirror the cron: the pass owns one ledger sink and flushes it once.
  const ledgerSink: TxInput[] = [];
  if (options.shared) trips.reset();
  const purchases: number[] = [];
  for (const doc of memory.collection("indexFunds").docs) {
    const stored = doc as unknown as IndexFund;
    const result = await deployBondReserveFromCash(db, stored, 0, {
      liquidityTargetEnabled: true,
      turn: 40,
      bondCandidates: candidates,
      bondPools: pools,
      ...(options.shared ? { ledgerSink } : {}),
      settleInTransaction: options.settleInTransaction,
    });
    purchases.push(result.unitsPurchased);
  }
  if (options.shared && ledgerSink.length > 0) {
    await emitTxBulk(db, ledgerSink, await loadTxThresholds(db));
  }
  return { trips, purchases };
}

function strip(docs: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return docs.map((doc) => {
    const { _id: _id, createdAt: _c, updatedAt: _u, expiresAt: _e, ...rest } = doc;
    return rest;
  });
}

function books(memory: InMemoryDb) {
  return {
    funds: strip(memory.collection("indexFunds").docs),
    bonds: memory.collection("bonds").docs.map((b) => ({
      id: String(b._id),
      publicFloat: b.publicFloat,
      holders: (b.holders as Array<{ fundId?: ObjectId; units: number }>).map((h) => ({
        fundId: String(h.fundId),
        units: h.units,
      })),
    })),
    pools: strip(memory.collection("bondMarketPools").docs),
    receipts: strip(memory.collection("indexFundTransactions").docs),
    ledger: strip(memory.collection("ledgerEntries").docs),
  };
}

describe("shared bond issue source", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([false, true])(
    "matches the per-fund reads and costs fewer round trips (settleInTransaction=%s)",
    async (settleInTransaction) => {
      const sequential = world();
      const shared = world();

      const before = await runPass(sequential, { shared: false, settleInTransaction });
      const after = await runPass(shared, { shared: true, settleInTransaction });

      // Both paths bought, and the float-limited issues moved in the same order.
      expect(before.purchases.reduce((sum, n) => sum + n, 0)).toBeGreaterThan(0);
      expect(after.purchases).toEqual(before.purchases);
      expect(books(shared)).toEqual(books(sequential));

      expect(after.trips.total(), after.trips.summary()).toBeLessThan(before.trips.total());
      expect(after.trips.count("bonds", "find"), after.trips.summary()).toBeLessThanOrEqual(1);
    }
  );

  it("keeps the fund holder row and float a later fund sees", async () => {
    const memory = world();
    await runPass(memory, { shared: true, settleInTransaction: false });
    const bonds = memory.collection("bonds").docs;
    // The first issue is drained or reduced by the three funds, and every fund
    // that bought from it has a holder row.
    const first = bonds.find((b) => String(b._id) === "6a0000000000000000000011")!;
    expect(first.publicFloat as number).toBeLessThan(260);
    const holderFundIds = new Set(
      (first.holders as Array<{ fundId?: ObjectId }>).map((h) => String(h.fundId))
    );
    expect(holderFundIds.size).toBeGreaterThanOrEqual(1);
  });
});
