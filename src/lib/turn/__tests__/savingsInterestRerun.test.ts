/**
 * A process death at any write boundary of the savings interest phase, then a rerun
 * of the same turn, lands the same balances, ledger rows and counters as an
 * uninterrupted turn. Sweeps every write call, before and after it applies.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { processSavingsInterestTurn } from "@/lib/turn/savingsInterestTurn";
import { getDb } from "@/lib/mongodb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

/** The in-memory driver has no transactions: roll the whole world back when a body throws. */
let activeWorld: InMemoryDb | null = null;
function cloneValue(value: unknown): unknown {
  if (value instanceof Date || value instanceof ObjectId) return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cloneValue(v)]));
  return value;
}
vi.mock("@/lib/db/runRequiredTransaction", () => ({
  runRequiredTransaction: async (body: (session: unknown) => Promise<unknown>) => {
    const world = activeWorld!;
    const snapshot = new Map(
      [...world.collections.entries()].map(([name, col]) => [name, col.docs.map(cloneValue)])
    );
    try {
      return await body({});
    } catch (error) {
      for (const [name, col] of world.collections) col.docs = (snapshot.get(name) ?? []) as never;
      throw error;
    }
  },
}));

/** Divisible by 12: accrual and the quarterly credit both run. */
const QUARTER_TURN = 504;
const SAVERS = [new ObjectId(), new ObjectId(), new ObjectId()];
const NPP = new ObjectId();

function world(): InMemoryDb {
  const db = createInMemoryDb();
  db.seed("gameConfig", [{ _id: "default", forexEnabled: true, nppAutonomyLevel: "v3" }]);
  db.seed("gameState", [{ _id: "current", currentTurn: QUARTER_TURN - 1, preset: "2019-default" }]);
  db.seed("centralBanks", [
    {
      _id: "US",
      countryId: "US",
      primeRate: 5,
      inflationHistory: [{ turn: 1, rate: 0 }],
      externalBroadMoney: 1_000_000,
      nationalSavingsBalance: 1_000_000_000,
    },
  ]);
  db.seed(
    "characters",
    SAVERS.map((_id, i) => ({
      _id,
      name: `Saver ${i}`,
      countryId: "US",
      currencyBalances: {
        savings: { USD: 48_000 * (i + 1) },
        savingsHolder: {},
        pendingSavingsInterest: { USD: 100 * (i + 1) },
        interestEarned: {},
      },
    }))
  );
  db.seed("npps", [
    {
      _id: NPP,
      currencyBalances: {
        savings: { USD: 96_000 },
        pendingSavingsInterest: { USD: 250 },
        interestEarned: {},
      },
    },
  ]);
  return db;
}

/**
 * Timestamps, and the national savings total: it is a cache re-summed from the
 * balances every turn, so a rerun after the credit sums the larger post-credit
 * balances and the next turn refreshes it.
 */
const DERIVED_OR_VOLATILE = new Set([
  "updatedAt",
  "createdAt",
  "nationalSavingsBalance",
  // Diagnostic counters booked after the credit lands; see `diagnostics` below.
  "netMoneyCreatedLifetime",
  "savingsInterestPaidLifetime",
  "savingsInterestBookedTurn",
]);

function endState(db: InMemoryDb) {
  const strip = (docs: Record<string, unknown>[]) =>
    docs.map((d) =>
      JSON.parse(JSON.stringify(d, (k, v) => (DERIVED_OR_VOLATILE.has(k) ? undefined : v)))
    );
  return {
    characters: strip(db.collection("characters").docs),
    npps: strip(db.collection("npps").docs),
    centralBanks: strip(db.collection("centralBanks").docs),
  };
}

/**
 * Rows and counters written after the credit transaction. A death between the credit
 * and these writes leaves them short (the pending interest is already flushed, so
 * nothing rebuilds them), but a rerun must never write them twice.
 */
function diagnostics(db: InMemoryDb) {
  const bank = db.collection("centralBanks").docs[0];
  return {
    savingsLedgerRows: db.collection("savingsLedger").docs.length,
    txLogRows: db.collection("financialTxLog").docs.length,
    netMoneyCreatedLifetime: Number(bank.netMoneyCreatedLifetime ?? 0),
    savingsInterestPaidLifetime: Number(bank.savingsInterestPaidLifetime ?? 0),
  };
}

describe("savingsInterestTurn rerun safety (stage 2)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("applying the phase twice for the same turn equals applying it once", async () => {
    const once = world();
    activeWorld = once;
    vi.mocked(getDb).mockResolvedValue(once as unknown as Db);
    await processSavingsInterestTurn(once as unknown as Db, QUARTER_TURN, true);
    const twice = world();
    activeWorld = twice;
    vi.mocked(getDb).mockResolvedValue(twice as unknown as Db);
    await processSavingsInterestTurn(twice as unknown as Db, QUARTER_TURN, true);
    await processSavingsInterestTurn(twice as unknown as Db, QUARTER_TURN, true);
    expect(endState(twice)).toEqual(endState(once));
    expect(diagnostics(twice)).toEqual(diagnostics(once));
    expect(diagnostics(once).savingsLedgerRows).toBeGreaterThan(0);
  });

  it("a death at any write boundary then a rerun equals an uninterrupted turn", async () => {
    const clean = world();
    activeWorld = clean;
    vi.mocked(getDb).mockResolvedValue(clean as unknown as Db);
    await processSavingsInterestTurn(clean as unknown as Db, QUARTER_TURN, true);
    const expected = endState(clean);
    const expectedDiagnostics = diagnostics(clean);

    let boundaries = 0;
    for (const afterWrite of [false, true]) {
      for (let onCall = 1; onCall <= 80; onCall++) {
        const db = world();
        activeWorld = db;
        const crash = withInjectedCrash(db, { onCall, afterWrite });
        vi.mocked(getDb).mockResolvedValue(crash.db);
        let died = false;
        try {
          await processSavingsInterestTurn(crash.db, QUARTER_TURN, true);
        } catch {
          died = true;
        }
        vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
        if (!died) break;
        boundaries += 1;
        await processSavingsInterestTurn(db as unknown as Db, QUARTER_TURN, true);
        expect(endState(db), `death at write ${onCall} afterWrite=${afterWrite}`).toEqual(expected);
        for (const [key, value] of Object.entries(diagnostics(db))) {
          expect(value, `${key} after death at write ${onCall}`).toBeLessThanOrEqual(
            expectedDiagnostics[key as keyof typeof expectedDiagnostics]
          );
        }
      }
    }
    expect(boundaries).toBeGreaterThan(4);
  });
});

const STAMP_KEYS = ["savingsAccrualTurn", "accrualTurn", "savingsInterestBookedTurn"];

describe("savingsInterestTurn below stage 2", () => {
  beforeEach(() => vi.clearAllMocks());

  async function oneTurn(rerunSafe: boolean) {
    const db = world();
    activeWorld = db;
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    await processSavingsInterestTurn(db as unknown as Db, QUARTER_TURN, rerunSafe);
    return db;
  }

  it("writes no stamp fields and the same money as the stamped path", async () => {
    const plain = await oneTurn(false);
    const stamped = await oneTurn(true);
    const text = JSON.stringify([
      plain.collection("characters").docs,
      plain.collection("npps").docs,
      plain.collection("centralBanks").docs,
    ]);
    for (const key of STAMP_KEYS) expect(text.includes(key), `${key} written`).toBe(false);
    expect(JSON.stringify(endState(stamped)).includes("savingsAccrualTurn")).toBe(true);
    const unstamped = (db: InMemoryDb) =>
      JSON.parse(JSON.stringify(endState(db), (k, v) => (STAMP_KEYS.includes(k) ? undefined : v)));
    expect(unstamped(plain)).toEqual(unstamped(stamped));
    expect(diagnostics(plain)).toEqual(diagnostics(stamped));
  });

  it("defaults to the unstamped path", async () => {
    const db = world();
    activeWorld = db;
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    await processSavingsInterestTurn(db as unknown as Db, QUARTER_TURN);
    expect(JSON.stringify(db.collection("characters").docs).includes("savingsAccrualTurn")).toBe(
      false
    );
  });
});
