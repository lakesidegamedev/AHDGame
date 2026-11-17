import {
  freezeDueSovereignCouponClaimSet,
  groupedRecords,
} from "@/lib/banking/frozenSovereignCouponClaims";
export { freezeDueSovereignCouponClaimSet } from "@/lib/banking/frozenSovereignCouponClaims";
export type {
  FreezeDueSovereignCouponInput,
  FrozenSovereignCouponClaimSet,
} from "@/lib/banking/frozenSovereignCouponClaims";
import {
  isDuplicateKeyError,
  batchPayoutTransition,
  loadCouponTargetReadiness,
} from "@/lib/banking/sovereignCouponBatchPayout";
export { loadCouponTargetReadiness } from "@/lib/banking/sovereignCouponBatchPayout";
import type {
  SovereignCouponClaimRecord,
  SovereignCouponSettlementPrefetch,
  CouponBatchRecord,
} from "@/lib/banking/sovereignCouponPrefetch";
import {
  OPEN_CLAIM,
  sovereignCouponClaimStore,
  BATCH_PROJECTION,
  couponBatchKey,
} from "@/lib/banking/sovereignCouponPrefetch";
export {
  sovereignCouponClaimStore,
  loadSovereignCouponSettlementPrefetch,
  couponBatchKey,
} from "@/lib/banking/sovereignCouponPrefetch";
export type {
  SovereignCouponClaimRecord,
  SovereignCouponSettlementPrefetch,
  CouponBatchRecord,
} from "@/lib/banking/sovereignCouponPrefetch";
import { createHash } from "node:crypto";
import { type Db, type Filter } from "mongodb";
import type { Bond } from "@/lib/db/types/bond";
import type { FederalBudget, FundedSovereignCouponClaim } from "@/lib/db/types/budget";

import {
  settleTransition,
  resumeSettlement,
  type SettlementResult,
} from "@/lib/banking/settlementJournal";

import { checkBalancedTransfer } from "@/lib/banking/rules/invariants";
import {
  sovereignCouponGroupTokenPrefix,
  type SovereignCouponCorporationQuote,
} from "@/lib/banking/rules/sovereignCoupons";

/**
 * One document per frozen coupon claim. Claims used to live in an array on the
 * country's `federalBudget` document, which every unfunded turn grew by one
 * claim per sovereign bond. That made every whole-budget read heavier each turn
 * and put the document on course for the 16 MB limit. The claim, its id and its
 * frozen quotes are unchanged; only where it is kept moved.
 */

import {
  FISCAL_SCALE_PLAYER_HOLDER_KINDS,
  claimAtFiscalScale,
  fiscalScaleCouponOrder,
} from "@/lib/budget/rules/fiscalScale";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";

import { payoutTransition } from "./sovereignCouponPayout";
export { SOVEREIGN_COUPON_CLAIMS_COLLECTION } from "./sovereignCouponPayout";
import {
  loadCouponCashWitnessContext,
  type CouponCashWitnessContext,
} from "./fundedCouponPayeeWitness";

/**
 * The claim fields a settlement reads.
 *
 * `order`, `createdAt` and the journal's publication marker are bookkeeping.
 * On a long arrears queue they are a measurable share of the bytes every pass
 * decodes, and nothing that settles a claim reads them.
 */
export const SOVEREIGN_COUPON_CLAIM_PROJECTION = {
  budgetId: 1,
  settledTurn: 1,
  claim: 1,
} as const;

/** The install probe of a grouped freeze also reads which bonds a saved claim carries. */
export const FROZEN_CLAIM_PROBE_PROJECTION = {
  ...SOVEREIGN_COUPON_CLAIM_PROJECTION,
  bondIds: 1,
} as const;

/** Lock key of one frozen coupon holder, or null when it credits no document. */
function couponHolderKey(
  kind: FundedSovereignCouponClaim["holders"][number]["kind"],
  id: string | undefined,
  currencyCode: string
): string | null {
  if (kind === "publicFloat") return `bondMarketPools:${currencyCode}`;
  if (!id) return null;
  if (kind === "character") return `characters:${id}`;
  if (kind === "imperial") return `imperialCharacters:${id}`;
  if (kind === "corporation") return `corporations:${id}`;
  if (kind === "fund") return `indexFunds:${id}`;
  if (kind === "npp") return `npps:${id}`;
  return null;
}

/**
 * Lock keys for every document a coupon payout can credit, as
 * `<collection>:<id>`. Matches the credit legs built in payoutTransition.
 */
export function sovereignCouponHolderKeys(claim: FundedSovereignCouponClaim): string[] {
  return claim.holders.flatMap((holder) => {
    const key = couponHolderKey(holder.kind, holder.id, claim.currencyCode);
    return key ? [key] : [];
  });
}

/** One distinct `(budget, holder)` pair from the lock-key aggregation. */
interface SettleableHolderKeyRow {
  _id: {
    budgetId: string;
    currencyCode: string;
    kind: FundedSovereignCouponClaim["holders"][number]["kind"];
    holderId?: string | null;
  };
}

/**
 * Holder lock keys of the claims each budget can move money for this pass, by
 * budget id.
 *
 * These keys exist to order the payees a payout may credit, and the payout loop
 * only acts on what `loadSettleableOpenSovereignCouponClaims` returns: a claim
 * within the cash the budget holds, or one a journal receipt already owns.
 * Reading every open claim to build the keys moved the whole backlog every
 * turn to settle a small fraction of it, and a Treasury that can settle nothing
 * still held the locks of every payee in its backlog. Asking the server for the
 * same predicate and grouping it down to distinct keys keeps the claim
 * documents that cross the wire to the ones that can actually move.
 *
 * `cashLocalByBudget` must be the figure the settle step bounds by or larger;
 * the Treasury phase passes the `treasuryCashLocal` it loaded, which accrual
 * does not touch and bank claims can only reduce.
 */
export async function settleableSovereignCouponHolderKeys(
  db: Db,
  cashLocalByBudget: ReadonlyMap<string, number>,
  receiptClaimIds: readonly string[]
): Promise<Map<string, Set<string>>> {
  const branches: Array<Record<string, unknown>> = [];
  for (const [budgetId, cashLocal] of cashLocalByBudget)
    branches.push({ budgetId, "claim.amountLocal": { $lte: Math.max(0, cashLocal) } });
  // A claim a receipt already owns is loaded and resumed whatever it is worth.
  const receipts = [...new Set(receiptClaimIds)];
  if (receipts.length > 0) branches.push({ _id: { $in: receipts } });
  if (!branches.length) return new Map();
  const rows = await sovereignCouponClaimStore(db)
    .aggregate<SettleableHolderKeyRow>([
      { $match: { settledTurn: { $exists: false }, $or: branches } },
      { $unwind: "$claim.holders" },
      {
        $group: {
          _id: {
            budgetId: "$budgetId",
            currencyCode: "$claim.currencyCode",
            kind: "$claim.holders.kind",
            holderId: "$claim.holders.id",
          },
        },
      },
    ])
    .toArray();
  const keys = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = couponHolderKey(row._id.kind, row._id.holderId ?? undefined, row._id.currencyCode);
    if (!key) continue;
    const set = keys.get(row._id.budgetId) ?? new Set<string>();
    set.add(key);
    keys.set(row._id.budgetId, set);
  }
  return keys;
}

/** Unpaid claims for one budget, in book order. Legacy array claims are not included. */
async function loadOpenSovereignCouponClaims(
  db: Db,
  budgetId: string
): Promise<FundedSovereignCouponClaim[]> {
  const rows = await sovereignCouponClaimStore(db)
    .find({ budgetId, ...OPEN_CLAIM }, { projection: SOVEREIGN_COUPON_CLAIM_PROJECTION })
    .sort({ "claim.dueTurn": 1, order: 1 })
    .toArray();
  return rows.map((row) => row.claim);
}

/**
 * Every per-claim coupon payout the journal still knows about, read once for
 * the whole turn. A budget then filters it to the claims it actually loaded.
 *
 * The per-claim alternative builds an `$or` with one `_id` regex per open claim
 * (tens of thousands of clauses per budget, hundreds of thousands per turn)
 * and makes the server evaluate all of them over the whole money-move
 * collection. One indexed prefix scan is the same answer for every budget.
 */
export async function loadSovereignCouponPriorPayouts(
  db: Db
): Promise<Array<{ _id: string; status: string }>> {
  return bankMoneyMovesCollection<{ _id: string; status: string }>(db)
    .find(
      { _id: { $regex: "^sovereign-coupon:" }, status: { $in: ["partial", "applied"] } },
      { projection: { _id: 1, status: 1 } }
    )
    .toArray();
}

/**
 * Unpaid claims one budget can still act on this turn: every claim no larger
 * than the cash it holds, plus the ones a prior receipt or a grouped receipt
 * already owns (those must be resumed even when the cash snapshot cannot cover
 * them). The loop skips any other claim before it can move money, so loading
 * it would only decode bytes.
 */
export async function loadSettleableOpenSovereignCouponClaims(
  db: Db,
  budgetId: string,
  maxAmountLocal: number,
  alsoClaimIds: ReadonlySet<string>
): Promise<FundedSovereignCouponClaim[]> {
  const cap =
    typeof maxAmountLocal === "number" && Number.isFinite(maxAmountLocal)
      ? Math.max(0, maxAmountLocal)
      : 0;
  const ids = [...alsoClaimIds];
  const base = { budgetId, ...OPEN_CLAIM };
  const filter =
    ids.length > 0
      ? {
          $and: [
            base,
            {
              $or: [{ "claim.amountLocal": { $lte: cap } }, { _id: { $in: ids } }],
            },
          ],
        }
      : { ...base, "claim.amountLocal": { $lte: cap } };
  const rows = await sovereignCouponClaimStore(db)
    .find(filter, { projection: SOVEREIGN_COUPON_CLAIM_PROJECTION })
    .sort({ "claim.dueTurn": 1, order: 1 })
    .toArray();
  return rows.map((row) => row.claim);
}

/**
 * The settleable claims of one budget with a per-turn cap: the `limit` oldest
 * claims within the bound, every claim within the bound owed to a player, and
 * every claim a receipt already owns. Two keyed reads. The fiscal scale's debt
 * service split uses it, because its bound reaches far past the cash held.
 */
export async function loadCappedSettleableOpenSovereignCouponClaims(
  db: Db,
  budgetId: string,
  maxAmountLocal: number,
  alsoClaimIds: ReadonlySet<string>,
  limit: number
): Promise<FundedSovereignCouponClaim[]> {
  const cap = Number.isFinite(maxAmountLocal) ? Math.max(0, maxAmountLocal) : 0;
  const base = { budgetId, ...OPEN_CLAIM };
  const ids = [...alsoClaimIds];
  const owed: Array<Record<string, unknown>> = [
    {
      "claim.amountLocal": { $lte: cap },
      "claim.holders.kind": { $in: [...FISCAL_SCALE_PLAYER_HOLDER_KINDS] },
    },
  ];
  if (ids.length > 0) owed.push({ _id: { $in: ids } });
  const store = sovereignCouponClaimStore(db);
  const [oldest, named] = await Promise.all([
    store
      .find(
        { ...base, "claim.amountLocal": { $lte: cap } },
        { projection: SOVEREIGN_COUPON_CLAIM_PROJECTION }
      )
      .sort({ "claim.dueTurn": 1, order: 1 })
      .limit(Math.max(0, Math.trunc(limit)))
      .toArray(),
    store
      .find({ $and: [base, { $or: owed }] }, { projection: SOVEREIGN_COUPON_CLAIM_PROJECTION })
      .toArray(),
  ]);
  const byId = new Map<string, FundedSovereignCouponClaim>();
  for (const row of [...oldest, ...named]) byId.set(row.claim.id, row.claim);
  return [...byId.values()].sort((a, b) => a.dueTurn - b.dueTurn);
}

/** Due turn of the oldest unpaid claim, or null when the budget owes none. */
export async function firstOpenSovereignCouponDueTurn(
  db: Db,
  budgetId: string
): Promise<number | null> {
  const row = await sovereignCouponClaimStore(db).findOne(
    { budgetId, ...OPEN_CLAIM },
    {
      projection: { _id: 0, "claim.dueTurn": 1 },
      sort: { "claim.dueTurn": 1, order: 1 },
    }
  );
  const due = (row as { claim?: { dueTurn?: unknown } } | null)?.claim?.dueTurn;
  return typeof due === "number" && Number.isFinite(due) ? due : null;
}

/** Currency codes a public-float holder can be paid in, across every open claim. */
export async function openSovereignCouponPoolCurrencies(
  db: Db,
  budgetId: string
): Promise<string[]> {
  return sovereignCouponClaimStore(db).distinct("claim.currencyCode", {
    budgetId,
    ...OPEN_CLAIM,
    "claim.holders.kind": "publicFloat",
  });
}

/**
 * One budget's share of a pass-wide coupon preparation
 * (`loadSovereignCouponPass`). Everything the settlement would otherwise read
 * for itself before it moves money.
 */
export interface PreparedSovereignCouponSettlement {
  /** Cash bound the pass loaded this budget's claims against. */
  cashBound: number;
  /** Per-claim payouts this budget's own bonds can own. */
  priorMoves: Array<{ _id: string; status: string }>;
  /** Grouped receipts that could own one of its queued claims. */
  batches: readonly CouponBatchRecord[];
  /** Claims this pass can act on, in book order. */
  claims: FundedSovereignCouponClaim[];
  /** Frozen claims the pass installed, with the record a replay wrote first. */
  fresh: Array<{ record: SovereignCouponClaimRecord; saved?: SovereignCouponClaimRecord }>;
  /** Claims whose every payee exists under its frozen quote. */
  readyClaimIds: ReadonlySet<string>;
  /** The pass decided this budget cannot move money this turn. */
  skipped: boolean;
}

/**
 * Insert claim records. Unordered, so a record a concurrent or replayed install
 * already wrote fails alone with a duplicate key and every other record lands.
 */
export async function insertClaimRecords(
  db: Db,
  records: SovereignCouponClaimRecord[]
): Promise<void> {
  if (!records.length) return;
  try {
    await sovereignCouponClaimStore(db).insertMany(records, { ordered: false });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
}

async function findPriorPayouts(
  db: Db,
  claims: FundedSovereignCouponClaim[]
): Promise<Array<{ _id: string; status: string }>> {
  if (!claims.length) return [];
  return bankMoneyMovesCollection<{ _id: string; status: string }>(db)
    .find(
      {
        $or: claims.map((claim) => ({ _id: { $regex: `^${escapeRegex(claim.id)}:attempt:` } })),
        status: { $in: ["partial", "applied"] },
      },
      { projection: { _id: 1, status: 1 } }
    )
    .toArray();
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The claim a journal attempt move belongs to. */
export const claimIdOfMove = (moveId: string) => moveId.slice(0, moveId.indexOf(":attempt:"));

/**
 * Every per-claim payout this budget's own bonds can own, out of the pass-wide
 * read. Bond ids come from this turn's live bonds and from the frozen-through
 * marks, which keep naming a bond after it matures while its claims are owed.
 */
export function sovereignCouponBudgetPriors(
  priorPayouts: ReadonlyArray<{ _id: string; status: string }>,
  input: { bonds: readonly Bond[]; frozenThrough?: Record<string, number>; budgetId?: string }
): Array<{ _id: string; status: string }> {
  const bondIds = new Set<string>();
  for (const bond of input.bonds) bondIds.add(bond._id.toHexString());
  for (const key of Object.keys(input.frozenThrough ?? {}))
    if (key.startsWith("b")) bondIds.add(key.slice(1));
  // A grouped claim names its budget in place of a bond.
  const groupPrefix =
    input.budgetId === undefined ? null : sovereignCouponGroupTokenPrefix(input.budgetId);
  return priorPayouts.filter((move) => {
    const token = move._id.slice("sovereign-coupon:".length).split(":")[0] ?? "";
    return bondIds.has(token) || (groupPrefix !== null && token.startsWith(groupPrefix));
  });
}

/** Claims a prior receipt or a grouped receipt already owns, for one budget. */
export function sovereignCouponQueuedClaimIds(
  priors: ReadonlyArray<{ _id: string; status: string }>,
  batches: readonly CouponBatchRecord[]
): Set<string> {
  const ids = new Set<string>();
  for (const batch of batches) for (const id of batchMembers(batch)) ids.add(id);
  for (const move of priors) ids.add(claimIdOfMove(move._id));
  return ids;
}

/**
 * A replayed grouped freeze whose id is already installed keeps the claim it
 * first wrote, as a per-bond replay does. A bond that claim does not carry
 * (the replay saw a bond the first freeze did not) is frozen into a
 * supplementary claim named after exactly those bonds, so no bond's coupon is
 * dropped and none is frozen twice. Returns the supplementary records, already
 * installed.
 */
export async function installGroupedReplaySupplements(
  db: Db,
  fresh: readonly SovereignCouponClaimRecord[],
  savedById: ReadonlyMap<string, SovereignCouponClaimRecord>,
  parts: ReadonlyMap<string, FundedSovereignCouponClaim[]>
): Promise<SovereignCouponClaimRecord[]> {
  const added: SovereignCouponClaimRecord[] = [];
  for (const record of fresh) {
    const saved = savedById.get(record._id);
    if (!saved || !record.bondIds) continue;
    const savedBonds = new Set(saved.bondIds ?? []);
    if (record.bondIds.every((id) => savedBonds.has(id))) continue;
    // Every part already written for this group and turn, supplements included.
    // A plain prefix keeps the _id index bounds; the supplement suffix is
    // matched here instead of in the pattern.
    const supplementId = new RegExp(`^${escapeRegex(record._id)}(:x[0-9a-f]+)?$`);
    const written = (
      await sovereignCouponClaimStore(db)
        .find({ _id: { $regex: `^${escapeRegex(record._id)}` } }, { projection: { bondIds: 1 } })
        .toArray()
    ).filter((row) => supplementId.test(String(row._id)));
    const covered = new Set(written.flatMap((row) => row.bondIds ?? []));
    const missing = (parts.get(record._id) ?? []).filter((claim) => !covered.has(claim.bondId));
    if (!missing.length) continue;
    const hash = createHash("sha256")
      .update(
        missing
          .map((claim) => claim.bondId)
          .sort()
          .join(",")
      )
      .digest("hex")
      .slice(0, 12);
    const supplement = groupedRecords(record.budgetId, missing, `:x${hash}`).records;
    await insertClaimRecords(db, supplement);
    added.push(...supplement);
  }
  return added;
}

/**
 * A budget whose cash bound is below its smallest open claim, that owns no
 * receipt-pinned claim and has no batch to resume settles nothing this pass:
 * every claim it could load is worth more than the cash it holds, so the
 * payout loop drops it before moving money. Skipping its claim load and
 * target-readiness work is the same answer for less work. A fresh claim that
 * could still fit under the bound keeps the full path, since only the
 * authoritative cash read can decide it.
 */
export function skipsSovereignCouponSettlement(input: {
  /** Cash the pass prefetch recorded, undefined when it had no entry. */
  prefetchedCashLocal: number | undefined;
  /** Cash bound the claim load and the payout loop settle against. */
  cashBoundLocal: number | undefined;
  /** Smallest open claim amount, legacy array claims included. */
  smallestOpenAmountLocal: number | undefined;
  smallestFreshAmountLocal: number;
  hasReceiptClaim: boolean;
  hasBatch: boolean;
  hasLegacyClaim: boolean;
}): boolean {
  if (input.prefetchedCashLocal === undefined) return false;
  if (input.cashBoundLocal === undefined) return false;
  if (input.hasLegacyClaim || input.hasBatch || input.hasReceiptClaim) return false;
  const smallestOpen = input.smallestOpenAmountLocal ?? Number.POSITIVE_INFINITY;
  return (
    smallestOpen > input.cashBoundLocal && input.smallestFreshAmountLocal > input.cashBoundLocal
  );
}

/**
 * Move a budget's legacy array claims into the claim store. A claim with a
 * partial or applied payout already in the journal stays in the array: its
 * frozen projection plan removes it from there, and moving it would leave that
 * plan pointing at nothing.
 */
async function migrateLegacyClaims(
  db: Db,
  budgetId: string,
  legacy: FundedSovereignCouponClaim[]
): Promise<FundedSovereignCouponClaim[]> {
  if (!legacy.length) return [];
  const priors = await findPriorPayouts(db, legacy);
  const pinned = new Set(priors.map((move) => claimIdOfMove(move._id)));
  const movable = legacy.filter((claim) => !pinned.has(claim.id));
  // A crash between the insert and the pull leaves a claim in both places; the
  // stored record wins and the pull below finishes the move.
  const stored = movable.length
    ? await sovereignCouponClaimStore(db)
        .find({ _id: { $in: movable.map((claim) => claim.id) } }, { projection: { _id: 1 } })
        .toArray()
    : [];
  const storedIds = new Set(stored.map((row) => row._id));
  await insertClaimRecords(
    db,
    movable.flatMap((claim, order) =>
      storedIds.has(claim.id)
        ? []
        : [{ _id: claim.id, budgetId, order, claim, createdAt: new Date() }]
    )
  );
  if (movable.length) {
    await federalBudgetCollection(db).updateOne(
      { _id: budgetId as FederalBudget["_id"] },
      { $pull: { sovereignCouponClaims: { id: { $in: movable.map((claim) => claim.id) } } } }
    );
  }
  return legacy.filter((claim) => pinned.has(claim.id));
}

/** Cash the Treasury currently holds in its own currency; missing reads as zero. */
async function readBudgetCash(db: Db, budgetId: unknown): Promise<number> {
  const row = await federalBudgetCollection(db).findOne(
    { _id: budgetId as never },
    { projection: { treasuryCashLocal: 1 } }
  );
  const value = (row as { treasuryCashLocal?: unknown } | null)?.treasuryCashLocal;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Freeze due-turn holder quotes before attempts; funded payout is journaled as one balanced native-currency move. */
export async function settleFundedSovereignCoupons(
  db: Db,
  budget: Pick<
    FederalBudget,
    "_id" | "countryId" | "sovereignCouponClaims" | "sovereignCouponFrozenThrough"
  >,
  input: {
    turn: number;
    bonds: Bond[];
    anchorRate: number;
    forexEnabled: boolean;
    corporateQuotes: ReadonlyMap<string, SovereignCouponCorporationQuote>;
    cashWitness?: CouponCashWitnessContext;
    /**
     * Per-turn cache of every per-claim payout the journal still knows about
     * (`loadSovereignCouponPriorPayouts`). When supplied, the claim load is
     * bounded by the cash this budget holds plus the claims a prior or a
     * grouped receipt already owns. Omitted, the pass keeps the historical
     * load-every-open-claim behaviour.
     */
    priorPayouts?: ReadonlyArray<{ _id: string; status: string }>;
    /**
     * Cash figure the caller built this budget's payee locks from. The claim
     * load never reaches past it, so cash credited after the locks were taken
     * cannot pull in a claim whose payees are unlocked; it settles next turn.
     */
    lockedCashBoundLocal?: number;
    /**
     * Per-budget facts the caller read once for the whole phase
     * (`loadSovereignCouponSettlementPrefetch`). When supplied, the cash bound,
     * the oldest-open probes, the pool currencies and the grouped receipts come
     * from it instead of one read per budget, and a budget that cannot cover
     * any open claim skips its claim load and target-readiness work. Omitted,
     * every fact is read per budget as before.
     */
    prefetch?: SovereignCouponSettlementPrefetch;
    /**
     * This budget's share of a pass-wide preparation
     * (`loadSovereignCouponPass`): the claims it can act on, the frozen claims
     * the pass already installed and the payees whose targets exist. Supplied,
     * the settlement moves money only and none of the queue reads happen here.
     */
    prepared?: PreparedSovereignCouponSettlement;
    /**
     * This country's fiscal scale when the debt service split is on (fiscal
     * scale stage 3). Claims without a journaled attempt settle synthetic
     * holders at book times the scale and player holders at face, player
     * claims first. Omitted, every claim settles at book, oldest first.
     */
    fiscalScale?: number;
    /**
     * Oldest claims the per-budget load may read this turn, on top of player
     * and receipt-owned claims. Set with `fiscalScale`; omitted, no cap.
     */
    claimLoadLimit?: number;
    /**
     * `gameConfig.sovereignCouponGroupedAccrualEnabled`: freeze this turn's
     * coupons as one claim per currency and payee group instead of one per
     * bond. Claims already frozen settle the same either way.
     */
    groupedAccrual?: boolean;
  }
): Promise<{ completed: boolean; batchClose?: CouponBatchCloseOp[] }> {
  const budgetId = String(budget._id);
  const pinnedLegacy = await migrateLegacyClaims(db, budgetId, budget.sovereignCouponClaims ?? []);
  const claimById = new Map<string, FundedSovereignCouponClaim>(
    pinnedLegacy.map((claim) => [claim.id, claim])
  );

  // The claim queue is bounded only by history: a Treasury that cannot cover
  // the oldest arrears still carries one claim per bond per unpaid turn. Read
  // what the queue can still act on this turn, not all of it.
  const prepared = input.prepared;
  let budgetPriors: Array<{ _id: string; status: string }> | undefined;
  let cashBound: number | undefined;
  let batches: CouponBatchRecord[] | undefined;
  let poolCurrencies: string[] | undefined;
  if (prepared) {
    budgetPriors = prepared.priorMoves;
    cashBound = prepared.cashBound;
    batches = [...prepared.batches];
  } else if (input.priorPayouts) {
    budgetPriors = sovereignCouponBudgetPriors(input.priorPayouts, {
      bonds: input.bonds,
      frozenThrough: budget.sovereignCouponFrozenThrough,
      budgetId,
    });
    // The cash figure is only a bound: the payout loop still reads the
    // authoritative cash and its guarded debit is the authority. A prefetched
    // phase reuses the cash it already loaded and locked against; without one
    // this read is what bounds the claim load.
    const prefetchedCash = input.prefetch?.cashLocalByBudget.get(budgetId);
    cashBound =
      prefetchedCash === undefined
        ? await readBudgetCash(db, budget._id)
        : Math.max(0, prefetchedCash);
    if (input.lockedCashBoundLocal !== undefined)
      cashBound = Math.min(cashBound, Math.max(0, input.lockedCashBoundLocal));
    if (input.prefetch) {
      batches = [...(input.prefetch.batchesByBudget.get(budgetId) ?? [])];
      poolCurrencies = [...(input.prefetch.poolCurrenciesByBudget.get(budgetId) ?? [])];
    } else {
      const legacyFirst = pinnedLegacy.length
        ? Math.min(...pinnedLegacy.map((claim) => claim.dueTurn))
        : null;
      [batches, poolCurrencies] = await Promise.all([
        (async () => {
          const storeFirst = await firstOpenSovereignCouponDueTurn(db, budgetId);
          // With no queued claim at all the historical loader would still probe
          // this turn's batch key (the fresh claims are in the list). Keep that.
          const first =
            storeFirst === null && legacyFirst === null
              ? input.turn
              : storeFirst === null
                ? legacyFirst
                : legacyFirst === null
                  ? storeFirst
                  : Math.min(storeFirst, legacyFirst);
          return loadCouponBatches(db, budgetId, first, input.turn);
        })(),
        openSovereignCouponPoolCurrencies(db, budgetId),
      ]);
    }
  }

  // Only the per-budget load needs the receipt-owned claim ids; a prepared
  // pass already loaded them.
  const alsoClaimIds = new Set<string>();
  if (!prepared) {
    if (batches)
      for (const batch of batches) for (const id of batchMembers(batch)) alsoClaimIds.add(id);
    if (budgetPriors) for (const move of budgetPriors) alsoClaimIds.add(claimIdOfMove(move._id));
  }

  // This turn's claims. A prepared pass froze and installed them for every
  // budget at once before its lanes started; otherwise this budget installs
  // its own here.
  const frozenSet = prepared
    ? undefined
    : freezeDueSovereignCouponClaimSet({
        budgetId,
        bonds: input.bonds,
        turn: input.turn,
        anchorRate: input.anchorRate,
        forexEnabled: input.forexEnabled,
        corporateQuotes: input.corporateQuotes,
        frozenThrough: budget.sovereignCouponFrozenThrough,
        knownClaims: claimById,
        grouped: input.groupedAccrual === true,
      });
  const fresh: SovereignCouponClaimRecord[] = prepared
    ? prepared.fresh.map((row) => row.record)
    : frozenSet!.records;

  // A budget that can settle nothing this pass skips its claim load and
  // target-readiness work entirely, as the payee locks already do.
  const prefetch = input.prefetch;
  const skipSettlementWork = prepared
    ? prepared.skipped
    : skipsSovereignCouponSettlement({
        prefetchedCashLocal: prefetch?.cashLocalByBudget.get(budgetId),
        cashBoundLocal: cashBound,
        smallestOpenAmountLocal: prefetch?.smallestOpenClaimAmountByBudget.get(budgetId),
        smallestFreshAmountLocal: fresh.reduce(
          (min, row) => Math.min(min, row.claim.amountLocal),
          Infinity
        ),
        hasReceiptClaim: (prefetch?.receiptClaimIdsByBudget.get(budgetId)?.size ?? 0) > 0,
        hasBatch: (batches?.length ?? 0) > 0,
        hasLegacyClaim: (budget.sovereignCouponClaims?.length ?? 0) > 0,
      });

  const loadedClaims = prepared
    ? prepared.claims
    : skipSettlementWork
      ? []
      : cashBound !== undefined
        ? input.claimLoadLimit !== undefined
          ? await loadCappedSettleableOpenSovereignCouponClaims(
              db,
              budgetId,
              cashBound,
              alsoClaimIds,
              input.claimLoadLimit
            )
          : await loadSettleableOpenSovereignCouponClaims(db, budgetId, cashBound, alsoClaimIds)
        : await loadOpenSovereignCouponClaims(db, budgetId);
  for (const claim of loadedClaims) claimById.set(claim.id, claim);

  if (prepared) {
    // The pass installed these before any lane started; its probe already
    // answered which of them a replay had written first.
    for (const row of prepared.fresh) {
      if (row.saved?.settledTurn !== undefined) continue;
      claimById.set(row.record._id, row.saved?.claim ?? row.record.claim);
    }
  } else if (fresh.length) {
    // A replayed install keeps the claim frozen the first time, and a claim
    // already paid stays paid.
    const existing = await sovereignCouponClaimStore(db)
      .find(
        { _id: { $in: fresh.map((row) => row._id) } },
        {
          projection: input.groupedAccrual
            ? FROZEN_CLAIM_PROBE_PROJECTION
            : SOVEREIGN_COUPON_CLAIM_PROJECTION,
        }
      )
      .toArray();
    const existingById = new Map(existing.map((row) => [row._id, row]));
    await insertClaimRecords(
      db,
      fresh.filter((row) => !existingById.has(row._id))
    );
    if (frozenSet!.parts.size > 0)
      fresh.push(
        ...(await installGroupedReplaySupplements(db, fresh, existingById, frozenSet!.parts))
      );
    await federalBudgetCollection(db).updateOne({ _id: budget._id }, { $max: frozenSet!.marks });
    for (const row of fresh) {
      const saved = existingById.get(row._id);
      if (saved?.settledTurn !== undefined) continue;
      claimById.set(row._id, saved?.claim ?? row.claim);
    }
  }

  const claims = [...claimById.values()].sort((a, b) => a.dueTurn - b.dueTurn);
  const claimIds = new Set(claims.map((claim) => claim.id));
  const priorMoves = budgetPriors
    ? budgetPriors.filter((move) => claimIds.has(claimIdOfMove(move._id)))
    : await findPriorPayouts(db, claims);
  const targetReadyClaimIds = prepared
    ? prepared.readyClaimIds
    : skipSettlementWork
      ? new Set<string>()
      : await loadCouponTargetReadiness(db, claims, poolCurrencies);
  // Claims a grouped receipt already owns settle only through that receipt.
  // Only a receipt whose every leg and projection landed closes its members;
  // one refused on resume moved no cash and leaves them owed.
  batches ??= await loadCouponBatches(
    db,
    budgetId,
    claims.length ? Math.min(...claims.map((claim) => claim.dueTurn)) : null,
    input.turn
  );
  const landed: CouponBatchRecord[] = [];
  const batched = new Set<string>();
  for (const batch of batches) {
    if (batch.status === "rejected") continue;
    if (!batchSettled(batch)) {
      const resumed = await resumeSettlement(db, batch._id);
      if (resumed.status === "partial") return { completed: false };
      if (!settlementLanded(resumed)) continue;
    }
    landed.push(batch);
    for (const id of batchMembers(batch)) batched.add(id);
  }
  const batchClose = couponBatchCloseOps(
    budgetId,
    landed,
    claims.filter((claim) => batched.has(claim.id))
  );
  if (prepared) {
    // A pass-wide caller writes every budget's close-out in one command.
  } else if (batchClose.length) {
    await sovereignCouponClaimStore(db).bulkWrite(batchClose, { ordered: false });
  }

  // Unpaid claims stay queued, so an unfunded Treasury carries one claim per
  // bond per turn of arrears. Attempting each through the journal writes a
  // rejected receipt and a failed guarded debit for every one of them, which
  // grows the phase without bound. Skip claims this snapshot of cash cannot
  // cover. The guarded debit remains the authority: a stale snapshot only
  // defers a claim one turn or lets the guard reject it as before. Read after
  // resumed batches, so their landed debits are not offered again.
  let fundableCash = 0;
  if (claims.length && !skipSettlementWork) {
    const cash = await federalBudgetCollection(db).findOne(
      { _id: budget._id },
      { projection: { treasuryCashLocal: 1 } }
    );
    const value = (cash as { treasuryCashLocal?: unknown } | null)?.treasuryCashLocal;
    fundableCash = typeof value === "number" && Number.isFinite(value) ? value : 0;
  }

  // At most one grouped receipt per Treasury and turn, holding at most
  // MAX_BATCH_CLAIMS claims. A claim that could join a batch but finds this
  // turn's batch already written or full stays owed for the next turn's batch,
  // so a replayed turn never falls back to one journal receipt per claim.
  const batchOpen = !batches.some((batch) => batch._id === couponBatchKey(budgetId, input.turn));
  const grouped: FundedSovereignCouponClaim[] = [];
  // Under the debt service split a claim is priced at the scale when it is
  // first attempted; a journaled attempt resumes with the legs it recorded.
  const hasAttempt = (claim: FundedSovereignCouponClaim) =>
    priorMoves.some(
      (move) =>
        move._id.startsWith(`${claim.id}:attempt:`) &&
        (move.status === "partial" || move.status === "applied")
    );
  const payable =
    input.fiscalScale === undefined
      ? claims
      : fiscalScaleCouponOrder(
          claims.map((claim) =>
            hasAttempt(claim) ? claim : claimAtFiscalScale(claim, input.fiscalScale)
          )
        );
  let cashWitness = input.cashWitness;
  const witnessForPayment = async () => (cashWitness ??= await loadCouponCashWitnessContext(db));
  for (const claim of payable) {
    if (batched.has(claim.id)) continue;
    const attempt = Math.max(input.turn, claim.dueTurn);
    const prior =
      priorMoves.find(
        (move) => move._id.startsWith(`${claim.id}:attempt:`) && move.status === "partial"
      ) ??
      priorMoves.find(
        (move) => move._id.startsWith(`${claim.id}:attempt:`) && move.status === "applied"
      );
    if (!prior && !targetReadyClaimIds.has(claim.id)) continue;
    if (!prior && claim.amountLocal > fundableCash) continue;
    // Claims in one currency whose holders are the bond pool, index funds, NPPs
    // or personal cash share a grouped receipt. A claim with its own journaled
    // attempt, a corporate holder, or a second currency keeps its own receipt.
    if (
      !prior &&
      isBatchable(claim, budgetId, attempt, input.fiscalScale !== undefined) &&
      claim.currencyCode === (grouped[0]?.currencyCode ?? claim.currencyCode)
    ) {
      if (batchOpen && grouped.length < MAX_BATCH_CLAIMS) {
        grouped.push(claim);
        fundableCash -= claim.amountLocal;
      }
      continue;
    }
    const result = prior
      ? await resumeSettlement(db, prior._id)
      : await settleTransition(
          db,
          payoutTransition(claim, budgetId, attempt, input.anchorRate, await witnessForPayment())
        );
    if (result.status === "partial")
      return prepared ? { completed: false, batchClose } : { completed: false };
    if (!prior && result.status === "applied") fundableCash -= claim.amountLocal;
    // A wholly rejected source guard has no landed cash leg. Keep the immutable claim for the next turn.
  }
  if (grouped.length) {
    const transition = batchPayoutTransition(
      grouped,
      budgetId,
      input.turn,
      input.anchorRate,
      await witnessForPayment()
    );
    const result = await settleTransition(db, transition);
    if (result.status === "partial")
      return prepared ? { completed: false, batchClose } : { completed: false };
    if (settlementLanded(result)) {
      // A replay keeps the membership the receipt was first written with.
      const saved = await bankMoneyMovesCollection<CouponBatchRecord>(db).findOne(
        { _id: transition.key },
        { projection: BATCH_PROJECTION }
      );
      if (saved && batchSettled(saved)) {
        if (prepared) batchClose.push(...couponBatchCloseOps(budgetId, [saved], grouped));
        else await markBatchMembersSettled(db, budgetId, [saved], grouped);
      }
    }
    // A rejected batch moved no cash, and a replay another attempt still owns
    // has not finished; either way its claims stay queued for the next turn.
  }

  // Paid records are only history once their receipt is acknowledged; keep
  // anything a journal may still publish to.
  // A pass-wide caller prunes every completed budget in one write; the
  // per-budget path keeps its own prune here.
  if (!prepared) {
    await sovereignCouponClaimStore(db).deleteMany({
      budgetId,
      settledTurn: { $lt: input.turn },
      pendingSettlementProjection: { $exists: false },
    });
  }
  return prepared ? { completed: true, batchClose } : { completed: true };
}

const batchTurn = (batch: CouponBatchRecord) =>
  Number(batch._id.slice(batch._id.lastIndexOf(":") + 1));

/**
 * Every leg and projection of the receipt landed. A batch with no pool credit
 * carries no projection, and the journal stamps completion only on a receipt
 * that published projections.
 */
const batchSettled = (batch: CouponBatchRecord) =>
  batch.status === "applied" &&
  (batch.projectionsCompletedAt !== undefined || (batch.projections?.length ?? 0) === 0);

/**
 * The settlement delivered its money and projections. A replay carrying an
 * error is a key another attempt owns and has not finished.
 */
const settlementLanded = (result: SettlementResult) =>
  result.status === "applied" || (result.status === "replayed" && !result.error);

const batchMembers = (batch: CouponBatchRecord): string[] =>
  String(batch.event?.meta?.claimIds ?? "")
    .split(",")
    .filter(Boolean);

/**
 * Every grouped receipt that could own a queued claim. A batch is attempted on
 * or after the due turn of each claim it holds, so the exact keys from the
 * oldest open due turn through this turn cover them all without a prefix scan.
 */
async function loadCouponBatches(
  db: Db,
  budgetId: string,
  first: number | null,
  turn: number
): Promise<CouponBatchRecord[]> {
  if (first === null) return [];
  const keys: string[] = [];
  for (let t = first; t <= turn; t++) keys.push(couponBatchKey(budgetId, t));
  return bankMoneyMovesCollection<CouponBatchRecord>(db)
    .find({ _id: { $in: keys } }, { projection: BATCH_PROJECTION })
    .toArray();
}

/**
 * Claims owned by a grouped coupon receipt that never landed. A receipt with a
 * refused leg is resumed on a later pass and finishes its remaining credits
 * then, so its members keep their payee locks even when this pass's cash bound
 * no longer covers their amounts. A landed receipt only closes its claim
 * records and needs no payee lock.
 */
export async function unfinishedSovereignCouponBatchClaimIds(db: Db): Promise<string[]> {
  const rows = await bankMoneyMovesCollection<CouponBatchRecord>(db)
    .find(
      {
        status: { $in: ["partial", "replayed"] },
        _id: { $regex: "^sovereign-coupon-batch:" },
      },
      { projection: { "event.meta.claimIds": 1 } }
    )
    .toArray();
  return rows.flatMap(batchMembers);
}

/** One claim-record close-out per landed batch, keyed by budget and receipt. */
export type CouponBatchCloseOp = {
  updateMany: {
    filter: Filter<SovereignCouponClaimRecord>;
    update: { $set: { settledTurn: number } };
  };
};

/**
 * Close-out writes for the claim records a landed grouped receipt paid. The
 * receipt, not the record, is the authority: a crash before these land leaves
 * the record open and the next attempt finds it in the batch membership and
 * closes it here, paying nothing. A pass-wide caller flushes them together,
 * because the receipts of different budgets own different claim records.
 */
function couponBatchCloseOps(
  budgetId: string,
  batches: readonly CouponBatchRecord[],
  open: readonly FundedSovereignCouponClaim[]
): CouponBatchCloseOp[] {
  const openIds = new Set(open.map((claim) => claim.id));
  return batches.flatMap((batch) => {
    const ids = batchMembers(batch).filter((id) => openIds.has(id));
    if (!ids.length) return [];
    return [
      {
        updateMany: {
          filter: { _id: { $in: ids }, budgetId, ...OPEN_CLAIM },
          update: { $set: { settledTurn: batchTurn(batch) } },
        },
      },
    ];
  });
}

async function markBatchMembersSettled(
  db: Db,
  budgetId: string,
  batches: CouponBatchRecord[],
  open: FundedSovereignCouponClaim[]
): Promise<void> {
  const ops = couponBatchCloseOps(budgetId, batches, open);
  if (ops.length) await sovereignCouponClaimStore(db).bulkWrite(ops, { ordered: false });
}

/**
 * Claims per grouped receipt. The receipt stores its member ids, so this bounds
 * the receipt document and the claim close-out write; a larger backlog drains
 * over the following turns.
 */
const MAX_BATCH_CLAIMS = 2000;

/**
 * A claim may join a grouped receipt when every credit targets a document by id
 * alone and its own per-claim receipt balances. Corporate credits carry a payee
 * currency guard per claim, so they keep the per-claim receipt, except under
 * the fiscal scale's debt service split: there every claim owed to a player is
 * loaded each turn, and one receipt per claim would cost tens of round trips
 * each. The grouped receipt keeps each distinct guard as its own credit leg,
 * and the target readiness probe has already dropped a claim whose guard fails.
 */
function isBatchable(
  claim: FundedSovereignCouponClaim,
  budgetId: string,
  attempt: number,
  allowCorporate = false
) {
  if (!allowCorporate && claim.holders.some((holder) => holder.kind === "corporation"))
    return false;
  try {
    return checkBalancedTransfer(payoutTransition(claim, budgetId, attempt).legs).length === 0;
  } catch {
    return false;
  }
}
