import { ObjectId, type Db } from "mongodb";
import { describe, expect, it } from "vitest";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import type { Bond } from "@/lib/db/types/bond";
import type { FederalBudget, FundedSovereignCouponClaim } from "@/lib/db/types/budget";
import {
  freezeDueSovereignCouponClaimSet,
  loadSovereignCouponSettlementPrefetch,
  settleFundedSovereignCoupons,
  sovereignCouponBudgetPriors,
  type SovereignCouponClaimRecord,
} from "./fundedSovereignCoupons";
import { loadSovereignCouponPass } from "./sovereignCouponPass";
import {
  groupSovereignCouponClaims,
  sovereignCouponGroupToken,
  sovereignCouponPayeeGroup,
} from "./rules/sovereignCoupons";

const oid = (n: number) => new ObjectId(n.toString(16).padStart(24, "0"));
const CHARACTERS = [oid(0xc1), oid(0xc2), oid(0xc3)];
const FUND = oid(0xf1);
const NPP = oid(0xa1);
const CORP = oid(0xb1);

function makeBonds(count: number): Bond[] {
  return Array.from({ length: count }, (_, i) => {
    const holders: Array<Record<string, unknown>> = [
      { characterId: CHARACTERS[i % CHARACTERS.length], units: 1 + (i % 4) },
    ];
    if (i % 3 === 0) holders.push({ fundId: FUND, units: 2 + (i % 5) });
    if (i % 7 === 0) holders.push({ nppId: NPP, units: 3 });
    return {
      _id: oid(0x100000 + i),
      issuerType: "sovereign",
      countryId: "US",
      currencyCode: "USD",
      couponRate: 3 + (i % 11) * 0.37,
      holders,
      publicFloat: 5 + (i % 13),
      defaulted: false,
      matured: false,
    } as unknown as Bond;
  });
}

function world(treasuryCashLocal: number): InMemoryDb {
  const db = createInMemoryDb();
  db.seed("federalBudget", [{ _id: "US", countryId: "US", treasuryBalance: 0, treasuryCashLocal }]);
  db.seed(
    "characters",
    CHARACTERS.map((_id) => ({ _id, cashOnHand: 0 }))
  );
  db.seed("indexFunds", [{ _id: FUND, cashAnchor: 0 }]);
  db.seed("npps", [{ _id: NPP, nppInvestmentCashAnchor: 0 }]);
  db.seed("corporations", [{ _id: CORP, countryId: "US", liquidCapital: 0 }]);
  db.seed("bondMarketPools", [{ _id: "USD", cashLocal: 0, lifetime: { couponsIn: 0 } }]);
  return db;
}

const budgetOf = (db: InMemoryDb) =>
  db.collection("federalBudget").docs[0] as unknown as FederalBudget & {
    treasuryCashLocal: number;
  };

const records = (db: InMemoryDb) =>
  db.collection("sovereignCouponClaims").docs as unknown as SovereignCouponClaimRecord[];

const openClaims = (db: InMemoryDb) =>
  records(db)
    .filter((row) => row.settledTurn === undefined)
    .map((row) => row.claim);

/** What each payee is owed across claims, keyed by kind and id. */
function owedByPayee(claims: readonly FundedSovereignCouponClaim[]): Map<string, number> {
  const owed = new Map<string, number>();
  for (const claim of claims)
    for (const holder of claim.holders) {
      const key = `${holder.kind}:${holder.id ?? claim.currencyCode}`;
      owed.set(key, (owed.get(key) ?? 0) + holder.amountLocal);
    }
  return owed;
}

const settleArgs = (turn: number, bonds: Bond[], groupedAccrual: boolean) => ({
  turn,
  bonds,
  anchorRate: 1,
  forexEnabled: false,
  corporateQuotes: new Map(),
  priorPayouts: [] as Array<{ _id: string; status: string }>,
  ...(groupedAccrual ? { groupedAccrual: true } : {}),
});

describe("grouped sovereign coupon accrual rules", () => {
  it("folds per-bond claims into one claim per turn, currency and payee group, conserving every payee", () => {
    const bonds = makeBonds(40);
    const set = freezeDueSovereignCouponClaimSet({
      budgetId: "US",
      bonds,
      turn: 9,
      anchorRate: 1,
      forexEnabled: false,
      corporateQuotes: new Map(),
      knownClaims: new Map(),
    });
    expect(set.records).toHaveLength(40);
    const perBond = set.records.map((row) => row.claim);
    const grouped = groupSovereignCouponClaims("US", perBond);
    expect(grouped.map((row) => row.claim.id).sort()).toEqual(
      [
        `sovereign-coupon:${sovereignCouponGroupToken("US", "USD", "market")}:9`,
        `sovereign-coupon:${sovereignCouponGroupToken("US", "USD", "player")}:9`,
      ].sort()
    );
    for (const row of grouped) {
      // Each leg is exactly the per-bond legs summed in bond order.
      for (const holder of row.claim.holders) {
        let local = 0;
        let anchor = 0;
        for (const claim of perBond)
          for (const leg of claim.holders)
            if (leg.kind === holder.kind && leg.id === holder.id) {
              local += leg.amountLocal;
              anchor += leg.amountAnchor;
            }
        expect(holder.amountLocal).toBe(local);
        expect(holder.amountAnchor).toBe(anchor);
        expect(sovereignCouponPayeeGroup(holder.kind)).toBe(row.group);
      }
      expect(row.claim.amountLocal).toBe(
        row.claim.holders.reduce((sum, holder) => sum + holder.amountLocal, 0)
      );
    }
    const before = owedByPayee(perBond);
    const after = owedByPayee(grouped.map((row) => row.claim));
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [key, amount] of before) expect(after.get(key)).toBe(amount);
  });

  it("keeps one claim per bond with the stage off", () => {
    const set = freezeDueSovereignCouponClaimSet({
      budgetId: "US",
      bonds: makeBonds(5),
      turn: 3,
      anchorRate: 1,
      forexEnabled: false,
      corporateQuotes: new Map(),
      knownClaims: new Map(),
    });
    expect(set.records.map((row) => row._id)).toEqual(
      makeBonds(5).map((bond) => `sovereign-coupon:${bond._id.toHexString()}:3`)
    );
    expect(set.records.every((row) => row.bondIds === undefined)).toBe(true);
    expect(set.parts.size).toBe(0);
  });

  it("attributes a grouped claim's journal moves to its own budget only", () => {
    const moves = [
      { _id: `sovereign-coupon:grp~US~USD~player:5:attempt:5`, status: "partial" },
      { _id: `sovereign-coupon:grp~USX~USD~player:5:attempt:5`, status: "partial" },
      { _id: `sovereign-coupon:grp~DE~EUR~market:5:attempt:5`, status: "applied" },
    ];
    expect(
      sovereignCouponBudgetPriors(moves, { bonds: [], budgetId: "US" }).map((m) => m._id)
    ).toEqual([moves[0]._id]);
    expect(sovereignCouponBudgetPriors(moves, { bonds: [] })).toEqual([]);
  });
});

describe("grouped sovereign coupon accrual", () => {
  it("bounds a 1,000-bond, 50-turn arrears queue and conserves what every payee is owed", async () => {
    const bonds = makeBonds(1_000);
    const grouped = world(0);
    for (let turn = 1; turn <= 50; turn++)
      await settleFundedSovereignCoupons(
        grouped as unknown as Db,
        budgetOf(grouped),
        settleArgs(turn, bonds, true)
      );
    // The per-bond claims the stage-off accrual would have frozen each turn.
    const perBondByTurn = new Map<number, FundedSovereignCouponClaim[]>();
    for (let turn = 1; turn <= 50; turn++)
      perBondByTurn.set(
        turn,
        freezeDueSovereignCouponClaimSet({
          budgetId: "US",
          bonds,
          turn,
          anchorRate: 1,
          forexEnabled: false,
          corporateQuotes: new Map(),
          knownClaims: new Map(),
        }).records.map((row) => row.claim)
      );
    expect([...perBondByTurn.values()].flat()).toHaveLength(50_000);
    // One claim per turn and payee group, against one per bond per turn.
    expect(records(grouped)).toHaveLength(100);
    expect(records(grouped).length).toBeLessThanOrEqual(50 * 2);
    expect(budgetOf(grouped).sovereignCouponFrozenThrough).toEqual(
      Object.fromEntries(bonds.map((bond) => [`b${bond._id.toHexString()}`, 50]))
    );

    // Per turn, each payee is owed exactly its per-bond legs summed in bond order.
    for (let turn = 1; turn <= 50; turn++) {
      const expected = owedByPayee(perBondByTurn.get(turn)!);
      const actual = owedByPayee(openClaims(grouped).filter((c) => c.dueTurn === turn));
      expect(actual).toEqual(expected);
    }
    const expectedTotal = owedByPayee([...perBondByTurn.values()].flat());
    const actualTotal = owedByPayee(openClaims(grouped));
    expect([...actualTotal.keys()].sort()).toEqual([...expectedTotal.keys()].sort());
    for (const [key, amount] of expectedTotal)
      expect(Math.abs(actualTotal.get(key)! - amount)).toBeLessThanOrEqual(amount * 1e-12);

    // Funded, the whole backlog settles once and every payee receives what it was owed.
    const owedTotal = openClaims(grouped).reduce((sum, claim) => sum + claim.amountLocal, 0);
    budgetOf(grouped).treasuryCashLocal = owedTotal * 2;
    const args = { ...settleArgs(51, [], true), priorPayouts: [] };
    await settleFundedSovereignCoupons(grouped as unknown as Db, budgetOf(grouped), args);
    expect(openClaims(grouped)).toEqual([]);
    expect(budgetOf(grouped).treasuryCashLocal).toBeCloseTo(owedTotal, 6);
    const characters = grouped.collection("characters").docs as unknown as Array<{
      _id: ObjectId;
      cashOnHand: number;
    }>;
    for (const character of characters) {
      const owed = expectedTotal.get(`character:${character._id.toHexString()}`)!;
      expect(Math.abs(character.cashOnHand - owed)).toBeLessThanOrEqual(owed * 1e-12);
    }
    const pool = grouped.collection("bondMarketPools").docs[0] as { cashLocal: number };
    const poolOwed = expectedTotal.get("publicFloat:USD")!;
    expect(Math.abs(pool.cashLocal - poolOwed)).toBeLessThanOrEqual(poolOwed * 1e-12);
    const fund = grouped.collection("indexFunds").docs[0] as { cashAnchor: number };
    const fundOwed = expectedTotal.get(`fund:${FUND.toHexString()}`)!;
    expect(Math.abs(fund.cashAnchor - fundOwed)).toBeLessThanOrEqual(fundOwed * 1e-12);

    // A second pass pays nothing more.
    const cashAfter = budgetOf(grouped).treasuryCashLocal;
    await settleFundedSovereignCoupons(grouped as unknown as Db, budgetOf(grouped), {
      ...args,
      turn: 52,
    });
    expect(budgetOf(grouped).treasuryCashLocal).toBe(cashAfter);
  }, 120_000);

  it("resumes a partially applied grouped payout without paying anyone twice", async () => {
    const bonds = makeBonds(6);
    const db = world(1_000_000);
    const args = settleArgs(12, bonds, true);
    const expected = owedByPayee(
      freezeDueSovereignCouponClaimSet({
        budgetId: "US",
        bonds,
        turn: 12,
        anchorRate: 1,
        forexEnabled: false,
        corporateQuotes: new Map(),
        knownClaims: new Map(),
      }).records.map((row) => row.claim)
    );
    const crash = withInjectedCrash(db, {
      collection: "characters",
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(settleFundedSovereignCoupons(crash.db, budgetOf(db), args)).rejects.toThrow(
      "crash"
    );
    await settleFundedSovereignCoupons(db as unknown as Db, budgetOf(db), {
      ...args,
      turn: 13,
      bonds: [],
    });
    await settleFundedSovereignCoupons(db as unknown as Db, budgetOf(db), {
      ...args,
      turn: 14,
      bonds: [],
    });
    expect(openClaims(db)).toEqual([]);
    for (const character of db.collection("characters").docs as unknown as Array<{
      _id: ObjectId;
      cashOnHand: number;
    }>)
      expect(character.cashOnHand).toBeCloseTo(
        expected.get(`character:${character._id.toHexString()}`) ?? 0,
        9
      );
    const total = [...expected.values()].reduce((sum, value) => sum + value, 0);
    expect(budgetOf(db).treasuryCashLocal).toBeCloseTo(1_000_000 - total, 6);
  });

  it("settles a corporate payee's grouped claim through its own receipt", async () => {
    const bonds = makeBonds(4).map((bond, i) =>
      i % 2 === 0 ? ({ ...bond, holders: [{ corporationId: CORP, units: 5 }] } as Bond) : bond
    );
    const db = world(1_000_000);
    const quotes = new Map([
      [
        CORP.toHexString(),
        {
          id: CORP.toHexString(),
          countryId: "US",
          currencyCode: "USD" as const,
          localPerAnchor: 1,
          currencyFieldPresent: false,
          currencyUsesCountryFallback: true,
        },
      ],
    ]);
    await settleFundedSovereignCoupons(db as unknown as Db, budgetOf(db), {
      ...settleArgs(20, bonds, true),
      corporateQuotes: quotes,
    });
    expect(openClaims(db)).toEqual([]);
    const moves = db.collection("bankMoneyMoves").docs as unknown as Array<{ _id: string }>;
    expect(
      moves.some((move) => move._id.startsWith("sovereign-coupon:grp~US~USD~player:20:attempt:"))
    ).toBe(true);
    const corp = db.collection("corporations").docs[0] as { liquidCapital: number };
    expect(corp.liquidCapital).toBeGreaterThan(0);
  });

  it("freezes a bond a replay sees for the first time into a supplement, never twice", async () => {
    const bonds = makeBonds(3);
    const db = world(0);
    await settleFundedSovereignCoupons(
      db as unknown as Db,
      budgetOf(db),
      settleArgs(30, bonds.slice(0, 2), true)
    );
    expect(records(db)).toHaveLength(2);
    // The marks never landed, and the replay sees a third bond.
    delete (budgetOf(db) as { sovereignCouponFrozenThrough?: unknown })
      .sovereignCouponFrozenThrough;
    await settleFundedSovereignCoupons(
      db as unknown as Db,
      budgetOf(db),
      settleArgs(30, bonds, true)
    );
    const ids = records(db).map((row) => row._id);
    expect(ids.filter((id) => id.includes(":30:x"))).toHaveLength(2);
    expect(owedByPayee(openClaims(db))).toEqual(
      owedByPayee(
        freezeDueSovereignCouponClaimSet({
          budgetId: "US",
          bonds,
          turn: 30,
          anchorRate: 1,
          forexEnabled: false,
          corporateQuotes: new Map(),
          knownClaims: new Map(),
          grouped: true,
        }).records.map((row) => row.claim)
      )
    );
    // Replayed again, nothing new is frozen.
    delete (budgetOf(db) as { sovereignCouponFrozenThrough?: unknown })
      .sovereignCouponFrozenThrough;
    await settleFundedSovereignCoupons(
      db as unknown as Db,
      budgetOf(db),
      settleArgs(30, bonds, true)
    );
    expect(records(db)).toHaveLength(4);
  });

  it("installs grouped claims for the whole cohort in the pass-wide preparation", async () => {
    const bonds = makeBonds(30);
    const db = world(0);
    const budget = budgetOf(db);
    const prefetch = await loadSovereignCouponSettlementPrefetch(db as unknown as Db, {
      budgets: [budget],
      turn: 40,
      receiptClaimIds: [],
    });
    const pass = await loadSovereignCouponPass(db as unknown as Db, {
      turn: 40,
      forexEnabled: false,
      corporateQuotes: new Map(),
      priorPayouts: [],
      prefetch,
      cashBounds: new Map([["US", 0]]),
      budgets: [{ budget, anchorRate: 1, bonds }],
      groupedAccrual: true,
    });
    expect(
      records(db)
        .map((row) => row._id)
        .sort()
    ).toEqual(["sovereign-coupon:grp~US~USD~market:40", "sovereign-coupon:grp~US~USD~player:40"]);
    expect(Object.keys(budgetOf(db).sovereignCouponFrozenThrough ?? {})).toHaveLength(30);
    expect(pass.get("US")?.fresh).toHaveLength(2);
  });
});
