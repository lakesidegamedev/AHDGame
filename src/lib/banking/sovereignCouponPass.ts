/**
 * The pass-wide half of the funded sovereign coupon settlement.
 *
 * One Treasury turn used to repeat the same queue probes inside every
 * country's lane: the settleable claim load, the payee existence reads, the
 * frozen-claim install probe and the payee pool upsert. Each of them is keyed
 * by budget id, so they answer for every country in one read instead of one
 * read per country, and the lane is then left with the money moves it alone
 * can order.
 *
 * The decisions are the same ones the per-budget path takes, taken from the
 * same prefetch. A claim is loaded when it is worth no more than the cash its
 * budget holds, or when a receipt already owns it; it is ready when every
 * payee document exists under the frozen quote it would be paid at; a budget
 * that can cover none of its queue is skipped exactly as before.
 */

import type { Bond } from "@/lib/db/types/bond";
import type { FederalBudget, FundedSovereignCouponClaim } from "@/lib/db/types/budget";
import type { Db } from "mongodb";
import {
  SOVEREIGN_COUPON_CLAIM_PROJECTION,
  freezeDueSovereignCouponClaims,
  insertClaimRecords,
  loadCouponTargetReadiness,
  skipsSovereignCouponSettlement,
  sovereignCouponBudgetPriors,
  sovereignCouponClaimStore,
  sovereignCouponQueuedClaimIds,
  type CouponBatchCloseOp,
  type CouponBatchRecord,
  type PreparedSovereignCouponSettlement,
  type SovereignCouponClaimRecord,
  type SovereignCouponSettlementPrefetch,
} from "@/lib/banking/fundedSovereignCoupons";
import type { SovereignCouponCorporationQuote } from "@/lib/banking/rules/sovereignCoupons";

/**
 * Receipt-owned claim ids one settleable-queue read may inline. A healthy pass
 * carries none, since only a receipt the journal still owns is named here.
 */
const CLAIM_LOOKUP_IDS_PER_READ = 5_000;

/** One budget the Treasury phase can settle this turn. */
export interface SovereignCouponPassBudget {
  budget: Pick<
    FederalBudget,
    | "_id"
    | "countryId"
    | "treasuryCashLocal"
    | "sovereignCouponClaims"
    | "sovereignCouponFrozenThrough"
  >;
  /** Native units per anchor unit, as the phase prices this budget. */
  anchorRate: number;
  /** The budget's live coupon-bearing bonds, as the phase loaded them. */
  bonds: Bond[];
}

export interface SovereignCouponPassInput {
  turn: number;
  forexEnabled: boolean;
  corporateQuotes: ReadonlyMap<string, SovereignCouponCorporationQuote>;
  /** Pass-wide per-claim payouts still in the journal, if the caller read them. */
  priorPayouts?: ReadonlyArray<{ _id: string; status: string }>;
  prefetch: SovereignCouponSettlementPrefetch;
  /** Cash bounds the phase took its payee locks from, by budget id. */
  cashBounds: ReadonlyMap<string, number>;
  budgets: readonly SovereignCouponPassBudget[];
}

/**
 * Close the claim records every landed grouped receipt paid, in one write. The
 * receipts of different budgets own different claim records, so the writes are
 * independent; only the round trips are shared.
 */
export async function flushSovereignCouponBatchClose(
  db: Db,
  ops: readonly CouponBatchCloseOp[]
): Promise<void> {
  if (ops.length === 0) return;
  await sovereignCouponClaimStore(db).bulkWrite([...ops], { ordered: false });
}

/**
 * Drop the settled claim history every completed budget no longer needs. The
 * per-budget pass issues this for its own budget; a prepared pass collects the
 * budgets that completed and issues it once.
 */
export async function pruneSovereignCouponClaims(
  db: Db,
  budgetIds: readonly string[],
  turn: number
): Promise<void> {
  if (budgetIds.length === 0) return;
  await sovereignCouponClaimStore(db).deleteMany({
    budgetId: { $in: [...budgetIds] },
    settledTurn: { $lt: turn },
    pendingSettlementProjection: { $exists: false },
  });
}

/**
 * Prepare every budget's coupon settlement for one pass.
 *
 * Claims a prior receipt already owns are loaded whatever they are worth, so a
 * partially applied payout always resumes. A budget with no prefetched cash
 * fact keeps the per-budget path and is absent from the result.
 */
export async function loadSovereignCouponPass(
  db: Db,
  input: SovereignCouponPassInput
): Promise<Map<string, PreparedSovereignCouponSettlement>> {
  const claims = sovereignCouponClaimStore(db);
  const prepared = new Map<
    string,
    {
      budgetId: string;
      cashBound: number;
      priorMoves: Array<{ _id: string; status: string }>;
      batches: CouponBatchRecord[];
      queuedClaimIds: Set<string>;
      fresh: SovereignCouponClaimRecord[];
      skipped: boolean;
    }
  >();

  for (const entry of input.budgets) {
    const budgetId = String(entry.budget._id);
    const prefetchedCash = input.prefetch.cashLocalByBudget.get(budgetId);
    if (prefetchedCash === undefined) continue;
    const locked = input.cashBounds.get(budgetId);
    // The payout loop still reads the authoritative cash; this bound only
    // decides which claims are worth loading and locking for.
    let cashBound = Math.max(0, prefetchedCash);
    if (locked !== undefined) cashBound = Math.min(cashBound, Math.max(0, locked));
    const priorMoves = sovereignCouponBudgetPriors(input.priorPayouts ?? [], {
      bonds: entry.bonds,
      frozenThrough: entry.budget.sovereignCouponFrozenThrough,
    });
    const batches = [...(input.prefetch.batchesByBudget.get(budgetId) ?? [])];
    const fresh = freezeDueSovereignCouponClaims({
      budgetId,
      bonds: entry.bonds,
      turn: input.turn,
      anchorRate: entry.anchorRate,
      forexEnabled: input.forexEnabled,
      corporateQuotes: input.corporateQuotes,
      frozenThrough: entry.budget.sovereignCouponFrozenThrough,
      knownClaims: new Map<string, FundedSovereignCouponClaim>(),
    });
    const skipped = skipsSovereignCouponSettlement({
      prefetchedCashLocal: prefetchedCash,
      cashBoundLocal: cashBound,
      smallestOpenAmountLocal: input.prefetch.smallestOpenClaimAmountByBudget.get(budgetId),
      smallestFreshAmountLocal: fresh.reduce(
        (min, row) => Math.min(min, row.claim.amountLocal),
        Infinity
      ),
      hasReceiptClaim: (input.prefetch.receiptClaimIdsByBudget.get(budgetId)?.size ?? 0) > 0,
      hasBatch: batches.length > 0,
      hasLegacyClaim: (entry.budget.sovereignCouponClaims?.length ?? 0) > 0,
    });
    prepared.set(budgetId, {
      budgetId,
      cashBound,
      priorMoves,
      batches,
      queuedClaimIds: sovereignCouponQueuedClaimIds(priorMoves, batches),
      fresh,
      skipped,
    });
  }

  // One existence probe and one unordered insert for every budget's frozen
  // claims, then one guarded mark per budget that froze any. The record is
  // written before its mark, so a crash between them re-installs the same id.
  const frozen = [...prepared.values()].flatMap((plan) => plan.fresh);
  const savedById = new Map<string, SovereignCouponClaimRecord>();
  if (frozen.length) {
    const existing = await claims
      .find(
        { _id: { $in: frozen.map((row) => row._id) } },
        { projection: SOVEREIGN_COUPON_CLAIM_PROJECTION }
      )
      .toArray();
    for (const row of existing) savedById.set(row._id, row);
    await insertClaimRecords(
      db,
      frozen.filter((row) => !savedById.has(row._id))
    );
    const marks = [...prepared.values()].flatMap((plan) =>
      plan.fresh.length
        ? [
            {
              updateOne: {
                filter: { _id: plan.budgetId },
                update: {
                  $max: Object.fromEntries(
                    plan.fresh.map((row) => [
                      `sovereignCouponFrozenThrough.b${row.claim.bondId}`,
                      row.claim.dueTurn,
                    ])
                  ),
                },
              },
            },
          ]
        : []
    );
    if (marks.length) await db.collection<FederalBudget>("federalBudget").bulkWrite(marks);
  }

  // One keyed read for every budget's settleable queue. Each branch is the
  // single-budget filter the lane used to issue, so the result is the union of
  // the same documents; grouping them back by budget keeps book order.
  //
  // The receipt-owned ids are inlined, as they were per budget, so a world
  // whose journal still names every claim it ever paid would put them all in
  // one command. A group is split before that, which costs a read only once a
  // cohort really carries that many receipt-owned claims.
  const requests = [...prepared.values()].filter((plan) => !plan.skipped);
  const groups: Array<typeof requests> = [];
  let group: typeof requests = [];
  let groupIds = 0;
  for (const plan of requests) {
    if (group.length > 0 && groupIds + plan.queuedClaimIds.size > CLAIM_LOOKUP_IDS_PER_READ) {
      groups.push(group);
      group = [];
      groupIds = 0;
    }
    group.push(plan);
    groupIds += plan.queuedClaimIds.size;
  }
  if (group.length > 0) groups.push(group);

  const loadedByBudget = new Map<string, FundedSovereignCouponClaim[]>();
  for (const plans of groups) {
    const branches = plans.map((plan) => {
      const base = { budgetId: plan.budgetId, settledTurn: { $exists: false } };
      if (plan.queuedClaimIds.size === 0)
        return { ...base, "claim.amountLocal": { $lte: plan.cashBound } };
      return {
        $and: [
          base,
          {
            $or: [
              { "claim.amountLocal": { $lte: plan.cashBound } },
              { _id: { $in: [...plan.queuedClaimIds] } },
            ],
          },
        ],
      };
    });
    const rows = await claims
      .find(branches.length === 1 ? branches[0] : { $or: branches }, {
        projection: SOVEREIGN_COUPON_CLAIM_PROJECTION,
      })
      .sort({ "claim.dueTurn": 1, order: 1 })
      .toArray();
    for (const row of rows) {
      const list = loadedByBudget.get(String(row.budgetId)) ?? [];
      list.push(row.claim);
      loadedByBudget.set(String(row.budgetId), list);
    }
  }

  // One payee upsert and one existence read per collection for every claim the
  // pass will offer to the payout loop, frozen ones included.
  const knownPoolCurrencies = new Set<string>();
  for (const plan of requests)
    for (const currencyCode of input.prefetch.poolCurrenciesByBudget.get(plan.budgetId) ?? [])
      knownPoolCurrencies.add(currencyCode);
  const readyClaims = requests.flatMap((plan) => [
    ...(loadedByBudget.get(plan.budgetId) ?? []),
    ...plan.fresh.flatMap((row) =>
      savedById.get(row._id)?.settledTurn !== undefined ? [] : [row.claim]
    ),
  ]);
  const readyClaimIds = await loadCouponTargetReadiness(db, readyClaims, [...knownPoolCurrencies]);

  const result = new Map<string, PreparedSovereignCouponSettlement>();
  for (const plan of prepared.values()) {
    result.set(plan.budgetId, {
      cashBound: plan.cashBound,
      priorMoves: plan.priorMoves,
      batches: plan.batches,
      claims: loadedByBudget.get(plan.budgetId) ?? [],
      fresh: plan.fresh.map((record) => ({ record, saved: savedById.get(record._id) })),
      readyClaimIds: plan.skipped ? new Set<string>() : readyClaimIds,
      skipped: plan.skipped,
    });
  }
  return result;
}
