import { type Db } from "mongodb";

import type { FederalBudget, FundedSovereignCouponClaim } from "@/lib/db/types/budget";

import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";

import { sovereignCouponClaimsCollection } from "@/lib/db/repositories/sovereignCouponClaims";

export interface SovereignCouponClaimRecord {
  /**
   * The claim id, `sovereign-coupon:<bondId>:<dueTurn>`. A grouped claim
   * (`sovereignCouponGroupedAccrualEnabled`) carries its group token in place
   * of the bond id.
   */
  _id: string;
  budgetId: string;
  /** Book position within the due turn, so claims settle in the order they were frozen. */
  order: number;
  claim: FundedSovereignCouponClaim;
  /**
   * Bonds whose coupon a grouped claim carries. Read only when a replayed
   * freeze finds the grouped id already installed; no settlement reads it.
   */
  bondIds?: string[];
  createdAt: Date;
  /** Set by the payout projection once the claim is paid. */
  settledTurn?: number;
  /** Written by the settlement journal while it publishes to this record; never set here. */
  pendingSettlementProjection?: unknown;
}

export const OPEN_CLAIM = { settledTurn: { $exists: false } };

export let claimIndexReady: Promise<unknown> | null = null;

/** The claim store, with its indexes ensured once per process. */
export function sovereignCouponClaimStore(db: Db) {
  const store = sovereignCouponClaimsCollection<SovereignCouponClaimRecord>(db);
  claimIndexReady ??= Promise.all([
    store.createIndex(
      { budgetId: 1, settledTurn: 1 },
      { name: "sovereignCouponClaims_budget_settled", background: true }
    ),
    // Serves the oldest-open-due-turn probe and the book-order sort without
    // fetching every claim document; the amount bound is checked on the
    // fetched candidates only.
    store.createIndex(
      { budgetId: 1, settledTurn: 1, "claim.dueTurn": 1, order: 1 },
      { name: "sovereignCouponClaims_budget_settled_due", background: true }
    ),
    // The cash bound is the predicate that decides which claims a pass can act
    // on at all. In the index it is one range per budget instead of a fetch of
    // every open claim the budget owns.
    store.createIndex(
      { budgetId: 1, settledTurn: 1, "claim.amountLocal": 1 },
      { name: "sovereignCouponClaims_budget_settled_amount", background: true }
    ),
    // The phase groups the whole open queue once per turn (oldest due turn,
    // smallest claim, which budgets owe one). Every budget-prefixed index has
    // `settledTurn` in second position, so that grouping cannot bound it; this
    // order walks only the open entries and covers the group.
    store.createIndex(
      { settledTurn: 1, budgetId: 1, "claim.dueTurn": 1, "claim.amountLocal": 1 },
      { name: "sovereignCouponClaims_open_queue", background: true }
    ),
  ]).catch((error) => {
    claimIndexReady = null;
    throw error;
  });
  return store;
}

/**
 * Per-budget coupon facts one Treasury phase reads before its settlement lanes
 * start. Each map is keyed by budget id and covers every budget the caller
 * passed to `loadSovereignCouponSettlementPrefetch`.
 */
export interface SovereignCouponSettlementPrefetch {
  /**
   * Budgets that still owe at least one stored claim.
   *
   * The phase used to ask the server for a distinct `budgetId` over every
   * claim with no `settledTurn`, which cannot use the budget-prefixed indexes
   * and walked the whole collection. The queue grouping below answers the same
   * question for the budgets actually loaded.
   */
  budgetsWithOpenClaims: ReadonlySet<string>;
  /** Cash each budget held in the projected budget read the phase locks against. */
  cashLocalByBudget: ReadonlyMap<string, number>;
  /** Due turn of each budget's oldest open claim, legacy array claims included. */
  firstOpenDueTurnByBudget: ReadonlyMap<string, number>;
  /** Amount of each budget's smallest open claim, legacy array claims included. */
  smallestOpenClaimAmountByBudget: ReadonlyMap<string, number>;
  /** Currency codes each budget's public-float holders can be paid in. */
  poolCurrenciesByBudget: ReadonlyMap<string, readonly string[]>;
  /** Grouped receipts that could own each budget's queued claims. */
  batchesByBudget: ReadonlyMap<string, readonly CouponBatchRecord[]>;
  /** Open claims a prior or grouped receipt still owns, by budget id. */
  receiptClaimIdsByBudget: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface OpenClaimBudgetSummaryRow {
  _id: string;
  firstDueTurn?: unknown;
  smallestAmountLocal?: unknown;
}

export interface OpenClaimPoolCurrencyRow {
  _id: { budgetId: string; currencyCode: string };
}

export const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * The per-budget probes `settleFundedSovereignCoupons` would otherwise issue
 * inside its lane, read once for the whole phase: the oldest open due turn and
 * smallest open amount (one grouped aggregation), the public-float currencies
 * (one grouped aggregation), the grouped receipts that could own a queued claim
 * (one keyed read over every budget's keys) and the open claims a receipt still
 * owns (one keyed read). Both aggregations are grouped by budget id, so the
 * server walks the claim queue once instead of once per budget. Legacy array
 * claims are folded in here because they are migrated into the store only when
 * the budget settles.
 */
export async function loadSovereignCouponSettlementPrefetch(
  db: Db,
  input: {
    budgets: ReadonlyArray<
      Pick<FederalBudget, "_id" | "treasuryCashLocal" | "sovereignCouponClaims">
    >;
    turn: number;
    receiptClaimIds: readonly string[];
  }
): Promise<SovereignCouponSettlementPrefetch> {
  const budgetIds = input.budgets.map((budget) => String(budget._id));
  const receiptIds = [...new Set(input.receiptClaimIds)];
  const [summaryRows, currencyRows, receiptRows] = await Promise.all([
    budgetIds.length
      ? sovereignCouponClaimStore(db)
          .aggregate<OpenClaimBudgetSummaryRow>([
            { $match: { ...OPEN_CLAIM, budgetId: { $in: budgetIds } } },
            {
              $group: {
                _id: "$budgetId",
                firstDueTurn: { $min: "$claim.dueTurn" },
                smallestAmountLocal: { $min: "$claim.amountLocal" },
              },
            },
          ])
          .toArray()
      : Promise.resolve<OpenClaimBudgetSummaryRow[]>([]),
    budgetIds.length
      ? sovereignCouponClaimStore(db)
          .aggregate<OpenClaimPoolCurrencyRow>([
            {
              $match: {
                ...OPEN_CLAIM,
                budgetId: { $in: budgetIds },
                "claim.holders.kind": "publicFloat",
              },
            },
            { $group: { _id: { budgetId: "$budgetId", currencyCode: "$claim.currencyCode" } } },
          ])
          .toArray()
      : Promise.resolve<OpenClaimPoolCurrencyRow[]>([]),
    receiptIds.length
      ? sovereignCouponClaimStore(db)
          .find(
            { _id: { $in: receiptIds }, ...OPEN_CLAIM },
            { projection: { _id: 1, budgetId: 1 } }
          )
          .toArray()
      : Promise.resolve<SovereignCouponClaimRecord[]>([]),
  ]);

  const budgetsWithOpenClaims = new Set<string>();
  const cashLocalByBudget = new Map<string, number>();
  const firstOpenDueTurnByBudget = new Map<string, number>();
  const smallestOpenClaimAmountByBudget = new Map<string, number>();
  const poolCurrenciesByBudget = new Map<string, Set<string>>();
  for (const budget of input.budgets) {
    const cash = budget.treasuryCashLocal;
    cashLocalByBudget.set(String(budget._id), finiteNumber(cash) ? Math.max(0, cash) : 0);
  }
  for (const row of summaryRows) {
    const budgetId = String(row._id);
    budgetsWithOpenClaims.add(budgetId);
    if (finiteNumber(row.firstDueTurn)) firstOpenDueTurnByBudget.set(budgetId, row.firstDueTurn);
    if (finiteNumber(row.smallestAmountLocal))
      smallestOpenClaimAmountByBudget.set(budgetId, row.smallestAmountLocal);
  }
  for (const row of currencyRows) {
    const budgetId = String(row._id.budgetId);
    const set = poolCurrenciesByBudget.get(budgetId) ?? new Set<string>();
    set.add(row._id.currencyCode);
    poolCurrenciesByBudget.set(budgetId, set);
  }
  // Legacy array claims land in the store when the budget settles, so the
  // prefetch has to answer for them as well.
  for (const budget of input.budgets) {
    const budgetId = String(budget._id);
    for (const claim of budget.sovereignCouponClaims ?? []) {
      const first = firstOpenDueTurnByBudget.get(budgetId);
      if (first === undefined || claim.dueTurn < first)
        firstOpenDueTurnByBudget.set(budgetId, claim.dueTurn);
      const smallest = smallestOpenClaimAmountByBudget.get(budgetId);
      if (smallest === undefined || claim.amountLocal < smallest)
        smallestOpenClaimAmountByBudget.set(budgetId, claim.amountLocal);
      if (!claim.holders.some((holder) => holder.kind === "publicFloat")) continue;
      const set = poolCurrenciesByBudget.get(budgetId) ?? new Set<string>();
      set.add(claim.currencyCode);
      poolCurrenciesByBudget.set(budgetId, set);
    }
  }
  const receiptClaimIdsByBudget = new Map<string, Set<string>>();
  for (const row of receiptRows) {
    const budgetId = String(row.budgetId);
    const set = receiptClaimIdsByBudget.get(budgetId) ?? new Set<string>();
    set.add(row._id);
    receiptClaimIdsByBudget.set(budgetId, set);
  }

  // Every grouped receipt that could own a queued claim, in one keyed read.
  // The keys are the same range `loadCouponBatches` builds per budget.
  const keyOwner = new Map<string, string>();
  const keys: string[] = [];
  for (const budget of input.budgets) {
    const budgetId = String(budget._id);
    const first = firstOpenDueTurnByBudget.get(budgetId) ?? input.turn;
    for (let turn = first; turn <= input.turn; turn++) {
      const key = couponBatchKey(budgetId, turn);
      keys.push(key);
      keyOwner.set(key, budgetId);
    }
  }
  const batchRows = keys.length
    ? await bankMoneyMovesCollection<CouponBatchRecord>(db)
        .find({ _id: { $in: keys } }, { projection: BATCH_PROJECTION })
        .toArray()
    : [];
  const batchesByBudget = new Map<string, CouponBatchRecord[]>();
  for (const row of batchRows) {
    const budgetId = keyOwner.get(row._id);
    if (!budgetId) continue;
    const list = batchesByBudget.get(budgetId) ?? [];
    list.push(row);
    batchesByBudget.set(budgetId, list);
  }

  return {
    budgetsWithOpenClaims,
    cashLocalByBudget,
    firstOpenDueTurnByBudget,
    smallestOpenClaimAmountByBudget,
    poolCurrenciesByBudget: new Map<string, readonly string[]>(
      [...poolCurrenciesByBudget].map(([budgetId, set]) => [budgetId, [...set]] as const)
    ),
    batchesByBudget,
    receiptClaimIdsByBudget,
  };
}

export type CouponBatchRecord = {
  _id: string;
  status?: string;
  projectionsCompletedAt?: Date;
  projections?: { applied?: boolean }[];
  event?: { meta?: { claimIds?: unknown } };
};

export const BATCH_PROJECTION = {
  _id: 1,
  status: 1,
  projectionsCompletedAt: 1,
  "projections.applied": 1,
  "event.meta.claimIds": 1,
} as const;

/** Grouped receipt key: one per Treasury and attempt turn. */
export function couponBatchKey(budgetId: string, turn: number): string {
  return `sovereign-coupon-batch:${budgetId}:${turn}`;
}
