import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { Bond } from "@/lib/db/types/bond";
import { BASE_DEMAND } from "@/lib/sovereignDefault/constants";
import { settleFundedSovereignBondMaturity } from "./sovereign";
import { sovereignRolloverBondId, sovereignRolloverBondUpsert } from "./sovereignRolloverBond";

vi.mock("@/lib/db/runRequiredTransaction", () => ({
  runRequiredTransaction: async (body: (session: unknown) => Promise<unknown>) => body({} as never),
}));

const NOW = new Date("2026-11-04T00:00:00Z");
const DUE_TURN = 48;
const TURN = 48;
const corporationId = new ObjectId("650000000000000000000a01");

/**
 * A maturity wall: `count` bonds of one issuer due on the same turn. Each has
 * 10 units, 6 held by the pool and 4 by a character, and the Treasury holds no
 * cash. Every bond therefore takes all three refinancing paths: the pool
 * novates half its float, the rest of its float is force-rolled, and the
 * character's principal is paid from a refunding issue.
 */
function wall(
  count: number,
  creditRating?: string
): { memory: InMemoryDb; due: Bond[]; holderId: ObjectId } {
  const memory = createInMemoryDb();
  memory.seed("gameConfig", [{ _id: "default", treasuryCashLedgerEnabled: true }]);
  memory.seed("exchangeRates", [{ _id: "USD", currencyCode: "USD", rate: 1 }]);
  memory.seed("federalBudget", [
    {
      _id: "federal",
      countryId: "US",
      currencyCode: "USD",
      treasuryBalance: 0,
      treasuryCashLocal: 0,
      debt: { principal: count * 10_000, ceiling: count * 10_000 },
      spending: { total: count * 500, debtInterest: count * 500 },
      surplus: 0,
      revenue: { total: 100 },
      gdp: 1_000_000,
      ...(creditRating ? { creditRating } : {}),
    },
  ]);
  memory.seed("centralBanks", [{ _id: "US", primeRate: 6 }]);
  memory.seed("bondMarketPools", [
    { _id: "USD", cashLocal: 10_000_000, appetiteByCountry: { US: BASE_DEMAND / 2 } },
  ]);
  const holderId = new ObjectId();
  memory.seed("characters", [{ _id: holderId, cashOnHand: 0 }]);
  const due = Array.from(
    { length: count },
    (_, i) =>
      ({
        _id: new ObjectId(`6600000000000000000${String(i).padStart(5, "0")}`),
        corporationId,
        issuerName: "Fixture Treasury",
        issuerType: "sovereign",
        countryId: "US",
        currencyCode: "USD",
        faceValue: 1_000,
        totalIssued: 10_000,
        couponRate: 5,
        maturityTurns: 48,
        issuedAtTurn: 0,
        maturityTurn: DUE_TURN,
        marketPrice: 1,
        matured: false,
        defaulted: false,
        restructureHaircutPercent: null,
        holders: [{ characterId: holderId, units: 4 }],
        publicFloat: 6,
      }) as unknown as Bond
  );
  memory.seed("bonds", due as unknown as Record<string, unknown>[]);
  return { memory, due, holderId };
}

async function settleWall(memory: InMemoryDb, due: Bond[], holderId: ObjectId, on: boolean) {
  for (const bond of due) {
    const live = memory
      .collection("bonds")
      .docs.find((row) => String(row._id) === bond._id.toHexString()) as unknown as Bond;
    const result = await settleFundedSovereignBondMaturity(memory as unknown as Db, {
      bond: live,
      turn: TURN,
      dueTurn: DUE_TURN,
      currencyCode: "USD",
      treasuryLocalPerAnchor: 1,
      nonBankRepaymentLocal: 10_000,
      holderLegs: [
        {
          collection: "characters",
          filter: { _id: holderId },
          path: "cashOnHand",
          amount: 4_000,
          currencyCode: "USD",
          localPerAnchor: 1,
          note: "Pay the character holder",
        },
        {
          collection: "bondMarketPools",
          filter: { _id: "USD" },
          path: "cashLocal",
          amount: 6_000,
          currencyCode: "USD",
          localPerAnchor: 1,
          note: "Pay the pool float",
        },
      ],
      now: NOW,
      consolidateRollover: on,
    });
    expect(result?.status).toBe("applied");
  }
}

function snapshot(memory: InMemoryDb, due: Bond[]) {
  const dueIds = new Set(due.map((bond) => bond._id.toHexString()));
  const fresh = memory
    .collection("bonds")
    .docs.filter((row) => !dueIds.has(String(row._id))) as unknown as Bond[];
  const budget = memory.collection("federalBudget").docs[0]!;
  const old = memory
    .collection("bonds")
    .docs.filter((row) => dueIds.has(String(row._id))) as unknown as Bond[];
  return {
    fresh,
    totals: {
      replacementFace: fresh.reduce((sum, bond) => sum + bond.totalIssued, 0),
      replacementFloat: fresh.reduce((sum, bond) => sum + bond.publicFloat, 0),
      // Face by coupon, so the debt service each coupon carries is compared too.
      faceByCoupon: Object.fromEntries(
        [...new Set(fresh.map((bond) => bond.couponRate))]
          .sort()
          .map((coupon) => [
            coupon,
            fresh
              .filter((bond) => bond.couponRate === coupon)
              .reduce((sum, bond) => sum + bond.totalIssued, 0),
          ])
      ),
      maturities: [...new Set(fresh.map((bond) => bond.maturityTurn))],
      poolCash: memory.collection("bondMarketPools").docs[0]!.cashLocal,
      holderCash: memory.collection("characters").docs[0]!.cashOnHand,
      treasuryCash: budget.treasuryCashLocal,
      treasuryBalance: budget.treasuryBalance,
      principal: (budget.debt as { principal: number }).principal,
      debtInterest: Math.round((budget.spending as { debtInterest: number }).debtInterest * 1e6),
      surplus: Math.round((budget.surplus as number) * 1e6),
      oldMatured: old.every((bond) => bond.matured === true),
      oldRemainingFace: old.reduce((sum, bond) => sum + bond.totalIssued, 0),
    },
  };
}

describe("sovereign rollover consolidation (maturity wall)", () => {
  const COUNT = 30;

  it("off: every maturing bond spawns its own replacement on each refinancing path", async () => {
    const { memory, due, holderId } = wall(COUNT);
    await settleWall(memory, due, holderId, false);
    const { fresh } = snapshot(memory, due);
    // Novation, forced pool rollover and the refunding issue: three per bond.
    expect(fresh).toHaveLength(COUNT * 3);
  });

  it.each([
    ["at the prime rate", undefined],
    ["with a credit spread on the rollover coupon", "BB"],
  ])(
    "on: the same wall refinances into one bond per coupon, money identical (%s)",
    async (_label, rating) => {
      const off = wall(COUNT, rating);
      await settleWall(off.memory, off.due, off.holderId, false);
      const on = wall(COUNT, rating);
      await settleWall(on.memory, on.due, on.holderId, true);

      const before = snapshot(off.memory, off.due);
      const after = snapshot(on.memory, on.due);
      // One shared bond per coupon the three paths priced at (novation at the
      // prime rate, forced rollover and refunding at the market rollover coupon),
      // never one per maturing bond.
      const coupons = new Set(before.fresh.map((bond) => bond.couponRate)).size;
      expect(coupons).toBe(rating ? 2 : 1);
      expect(after.fresh).toHaveLength(coupons);
      expect(after.fresh.every((bond) => bond.sovereignRolloverConsolidated === true)).toBe(true);
      // Every cash balance, the debt and its service, and the units are the same.
      expect(after.totals).toEqual(before.totals);
      expect(after.totals.oldMatured).toBe(true);
      expect(after.totals.holderCash).toBe(COUNT * 4_000);
      // Each unit of float is backed by its face.
      for (const bond of after.fresh) {
        expect(bond.totalIssued).toBe(bond.publicFloat * 1_000);
        expect(bond.requestedUnits).toBe(bond.publicFloat);
      }
    }
  );

  it("on: a replay of the whole wall adds no units and moves no money", async () => {
    const { memory, due, holderId } = wall(5);
    await settleWall(memory, due, holderId, true);
    const first = JSON.stringify(snapshot(memory, due).totals);
    const bonds = memory.collection("bonds").docs.length;
    for (const bond of due) {
      const live = memory
        .collection("bonds")
        .docs.find((row) => String(row._id) === bond._id.toHexString()) as unknown as Bond;
      await settleFundedSovereignBondMaturity(memory as unknown as Db, {
        bond: live,
        turn: TURN,
        dueTurn: DUE_TURN,
        currencyCode: "USD",
        treasuryLocalPerAnchor: 1,
        nonBankRepaymentLocal: 10_000,
        holderLegs: [],
        now: NOW,
        consolidateRollover: true,
      });
    }
    expect(memory.collection("bonds").docs).toHaveLength(bonds);
    expect(JSON.stringify(snapshot(memory, due).totals)).toBe(first);
  });
});

describe("sovereign rollover consolidation (repeated cycles)", () => {
  const COUNT = 30;
  const CYCLES = 6;
  const TERM = 48;

  /** Settle every live bond due on `turn`, paying its whole face to the pool. */
  async function settleDue(memory: InMemoryDb, turn: number): Promise<number> {
    const due = (memory.collection("bonds").docs as unknown as Bond[]).filter(
      (bond) => !bond.matured && bond.maturityTurn === turn
    );
    for (const bond of due) {
      const result = await settleFundedSovereignBondMaturity(memory as unknown as Db, {
        bond,
        turn,
        dueTurn: turn,
        currencyCode: "USD",
        treasuryLocalPerAnchor: 1,
        nonBankRepaymentLocal: bond.totalIssued,
        holderLegs: [
          {
            collection: "bondMarketPools",
            filter: { _id: "USD" },
            path: "cashLocal",
            amount: bond.totalIssued,
            currencyCode: "USD",
            localPerAnchor: 1,
            note: "Pay the pool float",
          },
        ],
        now: NOW,
        consolidateRollover: true,
      });
      expect(result?.status).toBe("applied");
    }
    return due.length;
  }

  it("keeps the live bond count bounded across many maturity cycles", async () => {
    const { memory, due, holderId } = wall(COUNT);
    await settleWall(memory, due, holderId, true);
    const liveCount = () =>
      (memory.collection("bonds").docs as unknown as Bond[]).filter((bond) => !bond.matured).length;
    const liveFace = () =>
      (memory.collection("bonds").docs as unknown as Bond[])
        .filter((bond) => !bond.matured)
        .reduce((sum, bond) => sum + bond.totalIssued, 0);

    const first = liveCount();
    // Prime-rate novation and the market rollover coupon: at most two series.
    expect(first).toBeLessThanOrEqual(2);
    const faceAfterFirst = liveFace();
    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      const turn = DUE_TURN + TERM * cycle;
      const settled = await settleDue(memory, turn);
      expect(settled).toBeGreaterThan(0);
      expect(settled).toBeLessThanOrEqual(2);
      expect(liveCount()).toBeLessThanOrEqual(2);
      // Refinancing replaces face for face: no growth, no loss.
      expect(liveFace()).toBe(faceAfterFirst);
    }
  });
});

describe("sovereignRolloverBondUpsert", () => {
  const identity = {
    countryId: "US" as const,
    currencyCode: "USD" as const,
    issuerName: "Fixture Treasury",
    corporationId,
    couponRate: 6.25,
    maturityTurns: 48 as const,
    issuedAtTurn: 671,
  };

  it("keys the shared bond on issuer, currency, coupon, term and turn", () => {
    const id = sovereignRolloverBondId(identity);
    expect(sovereignRolloverBondId({ ...identity })).toEqual(id);
    expect(sovereignRolloverBondId({ ...identity, couponRate: 6.5 })).not.toEqual(id);
    expect(sovereignRolloverBondId({ ...identity, issuedAtTurn: 672 })).not.toEqual(id);
    expect(sovereignRolloverBondId({ ...identity, countryId: "DE" })).not.toEqual(id);
  });

  it("creates the bond on the first write and only adds units after", async () => {
    const memory = createInMemoryDb();
    const bonds = memory.collection("bonds") as unknown as ReturnType<Db["collection"]>;
    for (const units of [3, 4]) {
      const { filter, update } = sovereignRolloverBondUpsert(identity, units, NOW);
      await bonds.updateOne(filter, update, { upsert: true });
    }
    expect(memory.collection("bonds").docs).toHaveLength(1);
    expect(memory.collection("bonds").docs[0]).toMatchObject({
      issuerType: "sovereign",
      countryId: "US",
      couponRate: 6.25,
      issuedAtTurn: 671,
      maturityTurn: 719,
      totalIssued: 7_000,
      publicFloat: 7,
      requestedUnits: 7,
      holders: [],
      matured: false,
    });
  });

  it("refuses a non-positive or fractional unit count", () => {
    expect(() => sovereignRolloverBondUpsert(identity, 0, NOW)).toThrow();
    expect(() => sovereignRolloverBondUpsert(identity, 1.5, NOW)).toThrow();
  });
});
