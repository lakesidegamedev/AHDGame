/**
 * The budgets substep of the Treasury phase, on a queue shaped like production.
 *
 * The phase settles one country per lane, and every per-country read it used to
 * issue is keyed by budget id: the settleable claim load, the payee existence
 * reads, the frozen-claim install probe, the payee pool upsert, the closed-claim
 * prune and the grouping probes. Those answer once for a cohort as well as once
 * per country, so the pass reads the queue once and the lane moves money.
 *
 * The fixtures below are the shape that made the difference visible: many
 * budgets, thousands of unpaid claims, a Treasury too short to clear its own
 * arrears, and one budget whose claims are frozen in a second currency. The
 * first four tests pin the exact post-turn state, which is the state the
 * per-budget implementation produced; the last two pin the round trips and
 * resume every journal write.
 */
import { ObjectId, type Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { countRoundTrips } from "@/lib/test-utils/roundTripCounter";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

/** A world per registered country, so every budget is live and accrues. */
const COUNTRIES: Array<[string, string]> = [
  ["US", "USD"],
  ["UK", "GBP"],
  ["JP", "JPY"],
  ["DE", "EUR"],
  ["IE", "EUR"],
  ["BR", "BRL"],
  ["CN", "CNY"],
  ["NG", "NGN"],
  ["HU", "HUF"],
  ["PL", "PLN"],
  ["RO", "RON"],
  ["YU", "YUD"],
  ["BG", "BGL"],
  ["CS", "CSK"],
  ["RU", "RUB"],
  ["FR", "EUR"],
  ["IT", "EUR"],
  ["ES", "EUR"],
  ["SE", "SEK"],
  ["TR", "TRY"],
  ["GR", "EUR"],
  ["AT", "EUR"],
  ["FI", "EUR"],
  ["DD", "DDM"],
];

const CLAIM_AMOUNT = 10;
const COUPON_RATE = 4.8;

interface WorldShape {
  /** Cash each Treasury holds at the opening of the turn. */
  cashLocal: number;
  /** Unpaid claims each country carries, spread over its arrears. */
  claimsPerBudget: number;
  /** Countries in the cohort; the fixture table is longer than this. */
  budgets?: number;
  privateBanking?: boolean;
}

function oid(value: number) {
  return new ObjectId(value.toString(16).padStart(24, "0"));
}

/**
 * One frozen claim against one bond: a character and the bond pool share it,
 * and it has been owed since `dueTurn`. A bond carries one claim per unpaid
 * turn, which is how arrears accumulate on production, and the oldest ones are
 * the ones a short Treasury can still pay.
 */
function claimRecord(input: {
  budgetId: string;
  bondId: string;
  currencyCode: string;
  order: number;
  dueTurn: number;
  holderId: ObjectId;
}): Record<string, unknown> {
  const id = `sovereign-coupon:${input.bondId}:${input.dueTurn}`;
  const amount = CLAIM_AMOUNT;
  return {
    _id: id,
    budgetId: input.budgetId,
    order: input.order,
    createdAt: new Date(0),
    claim: {
      id,
      bondId: input.bondId,
      dueTurn: input.dueTurn,
      countryId: input.budgetId,
      currencyCode: input.currencyCode,
      amountLocal: amount,
      amountAnchor: amount,
      anchorRate: 1,
      holders: [
        {
          kind: "character",
          id: input.holderId.toHexString(),
          currencyCode: input.currencyCode,
          amountLocal: amount / 2,
          amountAnchor: amount / 2,
          personalBalancePath: "cashOnHand",
        },
        {
          kind: "publicFloat",
          currencyCode: input.currencyCode,
          amountLocal: amount / 2,
          amountAnchor: amount / 2,
        },
      ],
    },
  };
}

function world(shape: WorldShape): InMemoryDb {
  const db = createInMemoryDb();
  db.seed("gameConfig", [
    {
      _id: "default",
      ledgerShadow: true,
      treasuryCashLedgerEnabled: true,
      privateBankingEnabled: shape.privateBanking === true,
    },
  ]);
  db.seed("gameState", [{ _id: "current", currentTurn: 460 }]);
  db.seed(
    "exchangeRates",
    [...new Set(COUNTRIES.map(([, code]) => code))].map((currencyCode) => ({
      _id: currencyCode,
      currencyCode,
      rate: 1,
    }))
  );
  const cohort = COUNTRIES.slice(0, shape.budgets ?? COUNTRIES.length);
  const budgets: Record<string, unknown>[] = [];
  const characters: Record<string, unknown>[] = [];
  const bonds: Record<string, unknown>[] = [];
  const claims: Record<string, unknown>[] = [];
  const pools: Record<string, unknown>[] = [];
  for (let b = 0; b < cohort.length; b++) {
    const [countryId, currencyCode] = cohort[b];
    const holderId = oid(0x1000 + b);
    characters.push({ _id: holderId, cashOnHand: 0 });
    pools.push({ _id: currencyCode, cashLocal: 0, lifetime: { couponsIn: 0 } });
    budgets.push({
      _id: countryId,
      countryId,
      currencyCode,
      gdp: 48_000,
      revenue: { total: 48_000 },
      spending: { total: 24_000, debtInterest: 0 },
      debt: { principal: 0, interestRate: 0 },
      investorConfidence: 70,
      treasuryBalance: 0,
      treasuryCashLocal: shape.cashLocal,
    });
    // One country issues in a second currency as well, so its claims cannot
    // all share one grouped receipt.
    const bondCurrencies = countryId === "US" ? [currencyCode, "EUR"] : [currencyCode];
    for (const bondCurrency of bondCurrencies) {
      if (!pools.some((pool) => pool._id === bondCurrency))
        pools.push({ _id: bondCurrency, cashLocal: 0, lifetime: { couponsIn: 0 } });
      bonds.push({
        _id: oid(0x2000 + b * 0x10 + bondCurrencies.indexOf(bondCurrency)),
        issuerType: "sovereign",
        countryId,
        currencyCode: bondCurrency,
        couponRate: COUPON_RATE,
        maturityTurn: 900,
        matured: false,
        defaulted: false,
        publicFloat: 1,
        holders: [{ characterId: holderId, units: 1 }],
      });
    }
    for (let i = 0; i < shape.claimsPerBudget; i++) {
      const bondIndex = i % bondCurrencies.length;
      claims.push(
        claimRecord({
          budgetId: countryId,
          bondId: oid(0x2000 + b * 0x10 + bondIndex).toHexString(),
          currencyCode: bondCurrencies[bondIndex],
          order: i,
          dueTurn: 1 + Math.floor(i / bondCurrencies.length),
          holderId,
        })
      );
    }
  }
  db.seed("federalBudget", budgets);
  db.seed("characters", characters);
  db.seed("bonds", bonds);
  db.seed("bondMarketPools", pools);
  db.seed("sovereignCouponClaims", claims);
  return db;
}

/**
 * Document shape with stable key order, name-free dates and hex ids. Mongo
 * keeps fields in write order, and which write created a field first is not a
 * property the state carries.
 */
function normalise(value: unknown): unknown {
  if (value instanceof Date) return "date";
  if (value instanceof ObjectId) return value.toHexString();
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, inner]) => [key, normalise(inner)])
    );
  return value;
}

/**
 * Every document the turn wrote, by collection and sorted by key. Settlement
 * lanes finish in whichever order the scheduler runs them, which is not a
 * property of the state they leave behind.
 */
function snapshot(db: InMemoryDb): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, collection] of db.collections) {
    const rows = normalise(collection.docs) as Array<Record<string, unknown>>;
    rows.sort((a, b) => String(a._id).localeCompare(String(b._id)));
    out[name] = rows;
  }
  return out;
}

/**
 * The same state without the banking counters. A resumed settlement records
 * that it resumed, which is what those counters are for; the money it lands is
 * the state under test.
 */
function moneyState(db: InMemoryDb): Record<string, unknown> {
  const state = snapshot(db);
  delete state.bankingTelemetry;
  return state;
}

/** Every balance the turn can move, and the ledger rows that witness it. */
function cashState(db: InMemoryDb): Record<string, unknown> {
  const rows = (name: string, fields: string[]) =>
    (db.collection(name).docs as Array<Record<string, unknown>>)
      .map((row) => {
        const picked: Record<string, unknown> = { _id: String(row._id) };
        for (const field of fields) picked[field] = normalise(row[field]) ?? null;
        return picked;
      })
      .sort((a, b) => String(a._id).localeCompare(String(b._id)));
  return {
    budgets: rows("federalBudget", ["treasuryCashLocal", "treasuryBalance", "treasuryAccrual"]),
    characters: rows("characters", ["cashOnHand"]),
    pools: rows("bondMarketPools", ["cashLocal"]),
    ledger: rows("ledgerEntries", ["turn", "legs", "balanced"]),
  };
}

/** Claims the turn closed. */
function settledClaimIds(db: InMemoryDb): string[] {
  return db
    .collection("sovereignCouponClaims")
    .docs.filter((row) => row.settledTurn !== undefined)
    .map((row) => String(row._id))
    .sort();
}

/**
 * Claim ids of the receipts a crash left short of its own stamp: a claimed but
 * unapplied projection, or every projection applied with the journal's status
 * still open. A claimed update projection is never retried blind (a
 * half-applied update cannot be told from an unapplied one), and a receipt
 * whose claims are already closed is no longer read by the phase, so both are
 * the repair queue's work rather than the next pass's. They are the crash
 * windows a later turn does not close on its own.
 */
function pendingReceiptClaimIds(db: InMemoryDb): string[] {
  const ids = new Set<string>();
  for (const row of db.collection("bankMoneyMoves").docs as Array<Record<string, unknown>>) {
    const projections = row.projections as
      Array<{ claimedAt?: unknown; applied?: boolean }> | undefined;
    const unfinished =
      row.status !== "applied" ||
      (projections ?? []).some((projection) => projection.claimedAt && !projection.applied);
    if (!unfinished) continue;
    const id = String(row._id);
    if (id.startsWith("sovereign-coupon-batch:")) {
      const members = (row.event as { meta?: { claimIds?: unknown } } | undefined)?.meta?.claimIds;
      for (const member of String(members ?? "").split(",")) if (member) ids.add(member);
      continue;
    }
    ids.add(id.slice(0, id.indexOf(":attempt:")));
  }
  return [...ids].sort();
}

function digest(db: InMemoryDb): string {
  return createHash("sha256")
    .update(JSON.stringify(snapshot(db)))
    .digest("hex");
}

async function runTurn(db: InMemoryDb, turn = 460): Promise<void> {
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  const { processTreasuryTurn } = await import("./treasuryTurn");
  await processTreasuryTurn(turn);
}

function budgetRows(db: InMemoryDb): Array<Record<string, unknown>> {
  return db.collection("federalBudget").docs as Array<Record<string, unknown>>;
}

function openClaimCount(db: InMemoryDb): number {
  return db.collection("sovereignCouponClaims").docs.filter((row) => row.settledTurn === undefined)
    .length;
}

describe("treasury budgets substep equivalence", () => {
  it("settles a short Treasury against a long queue to the recorded state", async () => {
    const db = world({ cashLocal: 500, claimsPerBudget: 300 });
    await runTurn(db);

    // Every Treasury paid fifty claims out of five hundred cash and kept the
    // rest owed, in book order, including the second-currency ones.
    const budgets = budgetRows(db);
    expect(budgets).toHaveLength(COUNTRIES.length);
    for (const budget of budgets) {
      expect(budget.treasuryCashLocal).toBe(500 - 50 * CLAIM_AMOUNT);
      expect(budget.treasuryAccrual).toMatchObject({ turn: 460, ledgerShadow: true });
    }
    // One claim per bond and unpaid turn, plus this turn's fresh claim for
    // each bond; the United States issues in two currencies.
    const seeded = COUNTRIES.length * 300 + COUNTRIES.length + 1;
    expect(db.collection("sovereignCouponClaims").docs).toHaveLength(seeded);
    expect(openClaimCount(db)).toBe(seeded - COUNTRIES.length * 50);
    expect(digest(db)).toBe("2fc2d6ce62744f097d262590659d3cad396ec713e319d1c88382d321948f64a6");
  }, 300_000);

  it("settles a Treasury that cannot cover one claim without loading the queue", async () => {
    const db = world({ cashLocal: 0, claimsPerBudget: 300 });
    await runTurn(db);

    // The pass still freezes this turn's claim for every bond, and pays none.
    expect(openClaimCount(db)).toBe(COUNTRIES.length * 300 + COUNTRIES.length + 1);
    expect(db.collection("bankMoneyMoves").docs).toHaveLength(0);
    expect(digest(db)).toBe("ccf2c7b1dd15e27dc2a58638e8ec38123fc6acd7032952fcd3242ef77224b581");
  }, 300_000);

  it("settles a funded Treasury through grouped receipts to the recorded state", async () => {
    const db = world({ cashLocal: 100_000, claimsPerBudget: 40 });
    await runTurn(db);

    // Forty arrears plus this turn's fresh claim per country, one grouped
    // receipt each, and the cash left over.
    expect(openClaimCount(db)).toBe(0);
    for (const budget of budgetRows(db)) expect(budget.treasuryCashLocal).toBeGreaterThan(0);
    expect(digest(db)).toBe("9c548ccf8df0b593ef762f51310212114ac2ea8e16775ba923133df928da53c3");
  }, 300_000);

  it("settles with private banking enabled to the recorded state", async () => {
    const db = world({ cashLocal: 500, claimsPerBudget: 40, privateBanking: true });
    await runTurn(db);

    expect(openClaimCount(db)).toBe(0);
    expect(digest(db)).toBe("15bb98f24e40cfb03efca8778375ce533769c12217aae035e5174ab8177b35bb");
  }, 300_000);

  it("reads the coupon queue once for the cohort, not once per budget", async () => {
    const db = world({ cashLocal: 500, claimsPerBudget: 300 });
    const trips = countRoundTrips(db);
    await runTurn(db);

    // One queue read, one frozen-claim probe, one close-out write and one prune
    // for every country; never a read per country.
    expect(trips.count("sovereignCouponClaims", "find")).toBe(2);
    expect(trips.count("sovereignCouponClaims", "distinct")).toBe(0);
    expect(trips.count("sovereignCouponClaims", "deleteMany")).toBe(1);
    expect(trips.count("sovereignCouponClaims", "bulkWrite")).toBe(1);
    expect(trips.count("bondMarketPools", "bulkWrite")).toBe(1);
    expect(trips.count("characters", "find")).toBe(1);
    expect(trips.count("ledgerEntries", "bulkWrite")).toBe(1);
    expect(trips.count("federalBudget", "bulkWrite")).toBe(1);
    // Grouped by budget for the payee locks, the oldest-open facts and the
    // pool currencies; none of them reads a claim document per budget.
    expect(trips.count("sovereignCouponClaims", "aggregate")).toBe(3);
    // The whole turn on this fixture. This is a budget, not an estimate: the
    // per-country implementation measured 1168 commands here, and every one of
    // the probes above cost one per budget. A change that moves this number has
    // to say which command it added and why the phase needs it.
    expect(trips.total()).toBe(1059);
  }, 300_000);

  it("resumes every journal write to the state the crash-free turn reaches", async () => {
    const clean = world({ cashLocal: 500, claimsPerBudget: 12, budgets: 2 });
    await runTurn(clean);
    const expected = moneyState(clean);

    // Every write the settlement chain makes, in the order it made them. The
    // recorder is the same proxy the fault injector uses, so a crash at an
    // occurrence here is the same write there.
    const recorded = world({ cashLocal: 500, claimsPerBudget: 12, budgets: 2 });
    const recorder = withInjectedCrash(recorded, { onCall: Number.MAX_SAFE_INTEGER });
    const { getDb } = await import("@/lib/mongodb");
    const { processTreasuryTurn } = await import("./treasuryTurn");
    vi.mocked(getDb).mockResolvedValue(recorder.db);
    await processTreasuryTurn(460);
    const writes: Array<{ collection: string; op: string; occurrence: number }> = [];
    const occurrences = new Map<string, number>();
    for (const entry of recorder.log) {
      const key = `${entry.collection}.${entry.op}`;
      const occurrence = (occurrences.get(key) ?? 0) + 1;
      occurrences.set(key, occurrence);
      writes.push({ collection: entry.collection, op: entry.op, occurrence });
    }
    expect(writes.length).toBeGreaterThan(20);

    let strict = 0;
    let deferred = 0;
    for (const write of writes) {
      const db = world({ cashLocal: 500, claimsPerBudget: 12, budgets: 2 });
      const crash = withInjectedCrash(db, {
        collection: write.collection,
        op: write.op as "insertOne",
        onCall: write.occurrence,
      });
      vi.mocked(getDb).mockResolvedValue(crash.db);
      await expect(processTreasuryTurn(460)).rejects.toThrow("crash");
      crash.disarm();
      // The retry resumes the receipts the crash left behind, and a second
      // retry settles anything the first one deferred to the next attempt.
      vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
      await processTreasuryTurn(460);
      await processTreasuryTurn(460);

      const stuck = pendingReceiptClaimIds(db);
      if (stuck.length === 0) {
        strict += 1;
        expect({ write, state: moneyState(db) }).toEqual({ write, state: expected });
        continue;
      }
      deferred += 1;
      // The repair queue owns those receipts. Everything the crash could have
      // double-moved or lost is still the clean state, and the only claims left
      // open are the ones whose own close-out is the stuck projection.
      expect({ write, cash: cashState(db) }).toEqual({ write, cash: cashState(clean) });
      const now = new Set(settledClaimIds(db));
      const wanted = new Set(settledClaimIds(clean));
      const differed = [...new Set([...now, ...wanted])].filter(
        (id) => now.has(id) !== wanted.has(id)
      );
      expect({ write, differed: differed.filter((id) => !stuck.includes(id)) }).toEqual({
        write,
        differed: [],
      });
    }
    // Most stops converge on the exact clean state. The rest are the journal's
    // own claimed-projection and unstamped-receipt windows, where the money is
    // identical but the receipt is the repair queue's to finish; if a change
    // moves work into that bucket this ratio is what notices.
    expect(strict).toBeGreaterThan(deferred * 2);
  }, 300_000);
});
