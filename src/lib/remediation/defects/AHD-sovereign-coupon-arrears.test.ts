import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { Bond } from "@/lib/db/types/bond";
import type { FederalBudget, FundedSovereignCouponClaim } from "@/lib/db/types/budget";
import {
  settleFundedSovereignCoupons,
  type SovereignCouponClaimRecord,
} from "@/lib/banking/fundedSovereignCoupons";
import { defect } from "./AHD-sovereign-coupon-arrears";
import type { HealContext } from "../types";

vi.mock("@/lib/db/runRequiredTransaction", () => ({
  runRequiredTransaction: async (body: (session: unknown) => Promise<unknown>) => body({} as never),
}));

const NOW = new Date("2026-11-04T00:00:00Z");
const ctx: HealContext = { env: "sandbox", dryRun: false, now: NOW, runId: "run_test" };
const oid = (n: number) => new ObjectId(n.toString(16).padStart(24, "0"));
const CHARACTER = oid(0xc1);
const FUND = oid(0xf1);

function bonds(count: number): Bond[] {
  return Array.from({ length: count }, (_, i) => {
    const holders: Array<Record<string, unknown>> = [{ fundId: FUND, units: 1 + (i % 3) }];
    if (i % 4 === 0) holders.push({ characterId: CHARACTER, units: 2 });
    return {
      _id: oid(0x200000 + i),
      issuerType: "sovereign",
      countryId: "GR",
      currencyCode: "GRD",
      couponRate: 2 + (i % 5) * 0.5,
      holders,
      publicFloat: 4 + (i % 7),
      defaulted: false,
      matured: false,
    } as unknown as Bond;
  });
}

function world(): InMemoryDb {
  const memory = createInMemoryDb();
  memory.seed("gameState", [{ _id: "current", currentTurn: 20 }]);
  memory.seed("federalBudget", [
    { _id: "GR", countryId: "GR", treasuryBalance: 0, treasuryCashLocal: 0 },
  ]);
  memory.seed("characters", [{ _id: CHARACTER, cashOnHand: 0 }]);
  memory.seed("indexFunds", [{ _id: FUND, cashAnchor: 0 }]);
  memory.seed("bondMarketPools", [{ _id: "GRD", cashLocal: 0, lifetime: { couponsIn: 0 } }]);
  return memory;
}

const budgetOf = (db: InMemoryDb) =>
  db.collection("federalBudget").docs[0] as unknown as FederalBudget & {
    treasuryCashLocal: number;
  };
const records = (db: InMemoryDb) =>
  db.collection("sovereignCouponClaims").docs as unknown as SovereignCouponClaimRecord[];
const open = (db: InMemoryDb) => records(db).filter((row) => row.settledTurn === undefined);

function owed(list: readonly FundedSovereignCouponClaim[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const claim of list)
    for (const holder of claim.holders) {
      const key = `${holder.kind}:${holder.id ?? claim.currencyCode}`;
      out.set(key, (out.get(key) ?? 0) + holder.amountLocal);
    }
  return out;
}

/** Ten unpaid turns of per-bond arrears, the stage-off shape. */
async function arrears(db: InMemoryDb, count = 12, turns = 10) {
  const list = bonds(count);
  for (let turn = 1; turn <= turns; turn++)
    await settleFundedSovereignCoupons(db as unknown as Db, budgetOf(db), {
      turn,
      bonds: list,
      anchorRate: 2,
      forexEnabled: false,
      corporateQuotes: new Map(),
      priorPayouts: [],
    });
}

describe("AHD-sovereign-coupon-arrears", () => {
  it("plans without writing and folds each turn into one claim per payee group", async () => {
    const db = world();
    await arrears(db);
    expect(open(db)).toHaveLength(120);
    const snapshot = JSON.stringify(db.collection("sovereignCouponClaims").docs);
    const healPlan = await defect.plan(db as unknown as Db, { ...ctx, dryRun: true });
    expect(JSON.stringify(db.collection("sovereignCouponClaims").docs)).toBe(snapshot);
    expect(healPlan.affected).toBe(120);
    expect(healPlan.moneyDelta).toBe(0);
    expect(healPlan.summary).toContain("open claims 120 -> 20");
  });

  it("folds with exact per-payee totals, backs up every member, then settles once funded", async () => {
    const db = world();
    await arrears(db);
    const before = owed(open(db).map((row) => row.claim));
    const healPlan = await defect.plan(db as unknown as Db, ctx);
    const result = await defect.apply(db as unknown as Db, healPlan, ctx);
    expect(result.documentsUpdated).toBe(120);
    expect(open(db)).toHaveLength(20);
    expect(open(db).every((row) => row._id.endsWith(":heal"))).toBe(true);
    expect(result.insertedIds?.[0]?.ids).toHaveLength(20);
    expect(db.collection("healBackups").docs).toHaveLength(120);
    const after = owed(open(db).map((row) => row.claim));
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [key, amount] of before)
      expect(Math.abs(after.get(key)! - amount)).toBeLessThanOrEqual(amount * 1e-12);
    expect((await defect.verify(db as unknown as Db, ctx)).ok).toBe(true);
    // A second plan finds nothing to fold.
    expect((await defect.plan(db as unknown as Db, ctx)).affected).toBe(0);

    // The folded claims settle through the stage-off path like any claim.
    const total = open(db).reduce((sum, row) => sum + row.claim.amountLocal, 0);
    budgetOf(db).treasuryCashLocal = total + 1;
    await settleFundedSovereignCoupons(db as unknown as Db, budgetOf(db), {
      turn: 21,
      bonds: [],
      anchorRate: 2,
      forexEnabled: false,
      corporateQuotes: new Map(),
      priorPayouts: [],
    });
    expect(open(db)).toHaveLength(0);
    expect(budgetOf(db).treasuryCashLocal).toBeCloseTo(1, 6);
    const character = db.collection("characters").docs[0] as { cashOnHand: number };
    expect(character.cashOnHand).toBeCloseTo(
      before.get(`character:${CHARACTER.toHexString()}`)!,
      9
    );
  });

  it("leaves receipt-owned and publishing claims alone", async () => {
    const db = world();
    await arrears(db, 4, 2);
    const [first, second] = open(db);
    db.seed("bankMoneyMoves", [
      { _id: `${first!._id}:attempt:2`, status: "partial" },
      {
        _id: "sovereign-coupon-batch:GR:2",
        status: "applied",
        event: { meta: { claimIds: second!._id } },
      },
      {
        _id: "sovereign-coupon-batch:GR:1",
        status: "rejected",
        event: { meta: { claimIds: "x" } },
      },
    ]);
    const third = open(db)[2]!;
    (third as { pendingSettlementProjection?: unknown }).pendingSettlementProjection = { key: "k" };
    const healPlan = await defect.plan(db as unknown as Db, ctx);
    // Turn 1 keeps one lone market-only claim, already the folded shape.
    expect(healPlan.affected).toBe(4);
    await defect.apply(db as unknown as Db, healPlan, ctx);
    const ids = open(db).map((row) => row._id);
    expect(ids).toEqual(expect.arrayContaining([first!._id, second!._id, third._id]));
  });

  it("aborts a group whose members moved after the plan", async () => {
    const db = world();
    await arrears(db, 4, 1);
    const healPlan = await defect.plan(db as unknown as Db, ctx);
    open(db)[0]!.settledTurn = 1;
    const result = await defect.apply(db as unknown as Db, healPlan, ctx);
    expect(result.documentsUpdated).toBe(0);
    expect(db.collection("healBackups").docs).toHaveLength(0);
    expect(records(db).some((row) => row._id.endsWith(":heal"))).toBe(false);
  });
});
