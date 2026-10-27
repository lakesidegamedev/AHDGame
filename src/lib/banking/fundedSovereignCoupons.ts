import { ObjectId, type Db } from "mongodb";
import type { Bond } from "@/lib/db/types/bond";
import type { FederalBudget, FundedSovereignCouponClaim } from "@/lib/db/types/budget";
import type { Corporation } from "@/lib/db/types/corporation";
import { resolveCorpLiquidCurrencyCode } from "@/lib/currency/corporationCapital";
import { bondAccruesCoupon } from "@/lib/constants/bonds";
import {
  settleTransition,
  resumeSettlement,
  type SettlementResult,
} from "@/lib/banking/settlementJournal";
import type { BankingTransition, TransitionLeg } from "@/lib/banking/rules/boundary";
import { checkBalancedTransfer } from "@/lib/banking/rules/invariants";
import {
  freezeSovereignCouponClaim,
  type SovereignCouponBondSnapshot,
  type SovereignCouponCorporationQuote,
} from "@/lib/banking/rules/sovereignCoupons";

/**
 * One document per frozen coupon claim. Claims used to live in an array on the
 * country's `federalBudget` document, which every unfunded turn grew by one
 * claim per sovereign bond. That made every whole-budget read heavier each turn
 * and put the document on course for the 16 MB limit. The claim, its id and its
 * frozen quotes are unchanged; only where it is kept moved.
 */
export const SOVEREIGN_COUPON_CLAIMS_COLLECTION = "sovereignCouponClaims";

export interface SovereignCouponClaimRecord {
  /** The claim id, `sovereign-coupon:<bondId>:<dueTurn>`. */
  _id: string;
  budgetId: string;
  /** Book position within the due turn, so claims settle in the order they were frozen. */
  order: number;
  claim: FundedSovereignCouponClaim;
  createdAt: Date;
  /** Set by the payout projection once the claim is paid. */
  settledTurn?: number;
  /** Written by the settlement journal while it publishes to this record; never set here. */
  pendingSettlementProjection?: unknown;
}

const OPEN_CLAIM = { settledTurn: { $exists: false } };
let claimIndexReady: Promise<unknown> | null = null;

function claimStore(db: Db) {
  const store = db.collection<SovereignCouponClaimRecord>(SOVEREIGN_COUPON_CLAIMS_COLLECTION);
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
  ]).catch((error) => {
    claimIndexReady = null;
    throw error;
  });
  return store;
}

/** Budget ids that still owe at least one stored coupon claim. */
export async function budgetIdsWithOpenSovereignCouponClaims(db: Db): Promise<Set<string>> {
  const ids = await claimStore(db).distinct("budgetId", OPEN_CLAIM);
  return new Set(ids.map(String));
}

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
  const rows = await claimStore(db)
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
export async function loadOpenSovereignCouponClaims(
  db: Db,
  budgetId: string
): Promise<FundedSovereignCouponClaim[]> {
  const rows = await claimStore(db)
    .find({ budgetId, ...OPEN_CLAIM })
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
  return db
    .collection<{ _id: string; status: string }>("bankMoneyMoves")
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
  const rows = await claimStore(db).find(filter).sort({ "claim.dueTurn": 1, order: 1 }).toArray();
  return rows.map((row) => row.claim);
}

/** Due turn of the oldest unpaid claim, or null when the budget owes none. */
export async function firstOpenSovereignCouponDueTurn(
  db: Db,
  budgetId: string
): Promise<number | null> {
  const row = await claimStore(db).findOne(
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
  return claimStore(db).distinct("claim.currencyCode", {
    budgetId,
    ...OPEN_CLAIM,
    "claim.holders.kind": "publicFloat",
  });
}

/**
 * Per-budget coupon facts one Treasury phase reads before its settlement lanes
 * start. Each map is keyed by budget id and covers every budget the caller
 * passed to `loadSovereignCouponSettlementPrefetch`.
 */
export interface SovereignCouponSettlementPrefetch {
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

interface OpenClaimBudgetSummaryRow {
  _id: string;
  firstDueTurn?: unknown;
  smallestAmountLocal?: unknown;
}

interface OpenClaimPoolCurrencyRow {
  _id: { budgetId: string; currencyCode: string };
}

const finiteNumber = (value: unknown): value is number =>
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
      ? claimStore(db)
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
      ? claimStore(db)
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
      ? claimStore(db)
          .find(
            { _id: { $in: receiptIds }, ...OPEN_CLAIM },
            { projection: { _id: 1, budgetId: 1 } }
          )
          .toArray()
      : Promise.resolve<SovereignCouponClaimRecord[]>([]),
  ]);

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
    ? await db
        .collection<CouponBatchRecord>("bankMoneyMoves")
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

/**
 * Insert claim records. Unordered, so a record a concurrent or replayed install
 * already wrote fails alone with a duplicate key and every other record lands.
 */
async function insertClaimRecords(db: Db, records: SovereignCouponClaimRecord[]): Promise<void> {
  if (!records.length) return;
  try {
    await claimStore(db).insertMany(records, { ordered: false });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, writeErrors } = error as { code?: unknown; writeErrors?: unknown };
  if (code === 11000) return true;
  return (
    Array.isArray(writeErrors) &&
    writeErrors.length > 0 &&
    writeErrors.every((row) => (row as { code?: unknown })?.code === 11000)
  );
}

async function findPriorPayouts(
  db: Db,
  claims: FundedSovereignCouponClaim[]
): Promise<Array<{ _id: string; status: string }>> {
  if (!claims.length) return [];
  return db
    .collection<{ _id: string; status: string }>("bankMoneyMoves")
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
    ? await claimStore(db)
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
    await db
      .collection<FederalBudget>("federalBudget")
      .updateOne(
        { _id: budgetId as FederalBudget["_id"] },
        { $pull: { sovereignCouponClaims: { id: { $in: movable.map((claim) => claim.id) } } } }
      );
  }
  return legacy.filter((claim) => pinned.has(claim.id));
}

function payoutTransition(
  claim: FundedSovereignCouponClaim,
  budgetId: string,
  attemptTurn: number
): BankingTransition {
  const key = `${claim.id}:attempt:${attemptTurn}`;
  const legs: BankingTransition["legs"] = [
    {
      kind: "debit",
      amount: claim.amountLocal,
      valuation: { currencyCode: claim.currencyCode, localPerAnchor: claim.anchorRate },
      collection: "federalBudget",
      filter: { _id: budgetId, treasuryCashLocal: { $gte: claim.amountLocal } },
      path: "treasuryCashLocal",
      note: "Pay sovereign coupon claims from funded Treasury cash",
    },
  ];
  for (const holder of claim.holders) {
    if (holder.kind === "publicFloat") {
      legs.push({
        kind: "credit",
        amount: holder.amountLocal,
        valuation: { currencyCode: claim.currencyCode, localPerAnchor: claim.anchorRate },
        collection: "bondMarketPools",
        filter: { _id: claim.currencyCode },
        path: "cashLocal",
        note: "Pay public-float sovereign coupon to its bond pool",
      });
    } else if (holder.kind === "character" || holder.kind === "imperial") {
      const path = holder.personalBalancePath;
      if (!path || !holder.id)
        throw new Error(`Invalid frozen sovereign coupon holder ${claim.id}`);
      legs.push({
        kind: "credit",
        amount: holder.amountLocal,
        valuation: { currencyCode: claim.currencyCode, localPerAnchor: claim.anchorRate },
        collection: holder.kind === "character" ? "characters" : "imperialCharacters",
        filter: { _id: new ObjectId(holder.id) },
        path,
        note: "Pay frozen sovereign coupon to personal cash",
      });
    } else if (holder.kind === "corporation") {
      if (!holder.id) throw new Error(`Missing corporation in sovereign coupon ${claim.id}`);
      const payeeRate = holder.payeeLocalPerAnchor;
      const payeeCurrency = holder.payeeCurrencyCode;
      if (!payeeRate || !payeeCurrency)
        throw new Error(`Missing frozen corporate FX quote for ${claim.id}`);
      legs.push({
        kind: "credit",
        amount: holder.amountAnchor * payeeRate,
        valuation: { currencyCode: payeeCurrency, localPerAnchor: payeeRate },
        collection: "corporations",
        filter: {
          _id: new ObjectId(holder.id),
          ...(holder.payeeCurrencyFieldPresent
            ? { liquidCurrencyCode: holder.payeeCurrencyFieldValue ?? null }
            : { liquidCurrencyCode: { $exists: false } }),
          ...(holder.payeeCurrencyUsesCountryFallback ? { countryId: holder.payeeCountryId } : {}),
        },
        path: "liquidCapital",
        note: "Pay frozen sovereign coupon to corporate cash",
      });
    } else if (holder.kind === "fund") {
      if (!holder.id) throw new Error(`Missing index fund in sovereign coupon ${claim.id}`);
      legs.push({
        kind: "credit",
        amount: holder.amountAnchor,
        valuation: { currencyCode: "ANCHOR", localPerAnchor: 1 },
        collection: "indexFunds",
        filter: { _id: new ObjectId(holder.id) },
        path: "cashAnchor",
        note: "Pay frozen sovereign coupon to index-fund cash",
      });
    } else if (holder.kind === "npp") {
      if (!holder.id) throw new Error(`Missing NPP in sovereign coupon ${claim.id}`);
      legs.push({
        kind: "credit",
        amount: holder.amountAnchor,
        valuation: { currencyCode: "ANCHOR", localPerAnchor: 1 },
        collection: "npps",
        filter: { _id: new ObjectId(holder.id) },
        path: "nppInvestmentCashAnchor",
        note: "Pay frozen sovereign coupon to NPP investment cash",
      });
    }
  }
  return {
    key,
    kind: "sovereign_coupon_funded_payout",
    turn: attemptTurn,
    currency: claim.currencyCode,
    legs,
    projections: [
      {
        collection: SOVEREIGN_COUPON_CLAIMS_COLLECTION,
        filter: { _id: claim.id, budgetId },
        update: { $set: { settledTurn: attemptTurn } },
        note: "Mark paid sovereign coupon claim settled",
      },
      ...claim.holders
        .filter((holder) => holder.kind === "publicFloat")
        .map((holder) => ({
          collection: "bondMarketPools",
          filter: { _id: claim.currencyCode },
          update: { $inc: { "lifetime.couponsIn": holder.amountLocal } },
          note: "Record funded public-float coupon receipt",
        })),
    ],
    event: {
      kind: "monetary.executed",
      command: "turn.sovereignCoupon.fundedPayout",
      subjectType: "country",
      subjectId: claim.countryId,
      amount: claim.amountLocal,
      meta: { claimId: claim.id, bondId: claim.bondId },
    },
  };
}

/** Cash the Treasury currently holds in its own currency; missing reads as zero. */
async function readBudgetCash(db: Db, budgetId: unknown): Promise<number> {
  const row = await db
    .collection<FederalBudget>("federalBudget")
    .findOne({ _id: budgetId as never }, { projection: { treasuryCashLocal: 1 } });
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
  }
): Promise<void> {
  const budgetId = String(budget._id);
  const pinnedLegacy = await migrateLegacyClaims(db, budgetId, budget.sovereignCouponClaims ?? []);
  const claimById = new Map<string, FundedSovereignCouponClaim>(
    pinnedLegacy.map((claim) => [claim.id, claim])
  );

  // The claim queue is bounded only by history: a Treasury that cannot cover
  // the oldest arrears still carries one claim per bond per unpaid turn. Read
  // what the queue can still act on this turn, not all of it.
  let budgetPriors: Array<{ _id: string; status: string }> | undefined;
  let cashBound: number | undefined;
  let batches: CouponBatchRecord[] | undefined;
  let poolCurrencies: string[] | undefined;
  if (input.priorPayouts) {
    const bondIds = new Set<string>();
    for (const bond of input.bonds) bondIds.add(bond._id.toHexString());
    for (const key of Object.keys(budget.sovereignCouponFrozenThrough ?? {}))
      if (key.startsWith("b")) bondIds.add(key.slice(1));
    budgetPriors = input.priorPayouts.filter((move) =>
      bondIds.has(move._id.slice("sovereign-coupon:".length).split(":")[0] ?? "")
    );
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

  const alsoClaimIds = new Set<string>();
  if (batches)
    for (const batch of batches) for (const id of batchMembers(batch)) alsoClaimIds.add(id);
  if (budgetPriors) for (const move of budgetPriors) alsoClaimIds.add(claimIdOfMove(move._id));

  // Freeze this turn's claims. The record is written before the frozen-through
  // mark, so a crash between the two re-installs the same id (a no-op) rather
  // than losing the claim.
  const fresh: SovereignCouponClaimRecord[] = [];
  for (const bond of input.bonds) {
    if (
      bond.issuerType !== "sovereign" ||
      bond.defaulted ||
      bond.matured ||
      !bondAccruesCoupon(bond)
    )
      continue;
    const bondId = bond._id.toHexString();
    const claimId = `sovereign-coupon:${bondId}:${input.turn}`;
    if (claimById.has(claimId)) continue;
    if ((budget.sovereignCouponFrozenThrough?.[`b${bondId}`] ?? -1) >= input.turn) continue;
    const snapshot: SovereignCouponBondSnapshot = {
      id: bond._id.toHexString(),
      countryId: String(bond.countryId ?? ""),
      currencyCode: bond.currencyCode,
      couponRate: bond.couponRate,
      publicFloat: bond.publicFloat,
      holders: (bond.holders ?? []).map((holder) => {
        if (holder.bankId || holder.bankTreasuryTradeId)
          return { kind: "bank", units: holder.units };
        if (holder.characterId)
          return { kind: "character", id: holder.characterId.toHexString(), units: holder.units };
        if (holder.imperialCharacterId)
          return {
            kind: "imperial",
            id: holder.imperialCharacterId.toHexString(),
            units: holder.units,
          };
        if (holder.corporationId)
          return {
            kind: "corporation",
            id: holder.corporationId.toHexString(),
            units: holder.units,
          };
        if (holder.fundId)
          return { kind: "fund", id: holder.fundId.toHexString(), units: holder.units };
        if (holder.nppId)
          return { kind: "npp", id: holder.nppId.toHexString(), units: holder.units };
        return { kind: "bank", units: holder.units };
      }),
    };
    const claim = freezeSovereignCouponClaim({
      bond: snapshot,
      turn: input.turn,
      anchorRate: input.anchorRate,
      forexEnabled: input.forexEnabled,
      corporateQuotes: input.corporateQuotes,
    });
    if (!claim) continue;
    fresh.push({ _id: claim.id, budgetId, order: fresh.length, claim, createdAt: new Date() });
  }

  // A budget whose cash bound is below its smallest open claim, that owns no
  // receipt-pinned claim and has no batch to resume settles nothing this pass:
  // every claim it could load is worth more than the cash it holds, so the
  // payout loop drops it before moving money. Skip its claim load and
  // target-readiness work entirely, as the payee locks already do. A fresh
  // claim that could still fit under the bound keeps the full path, since only
  // the authoritative cash read can decide it.
  const prefetch = input.prefetch;
  const cashBoundForSkip = cashBound;
  const smallestFreshAmount = fresh.reduce(
    (min, row) => Math.min(min, row.claim.amountLocal),
    Infinity
  );
  const skipSettlementWork =
    prefetch !== undefined &&
    prefetch.cashLocalByBudget.has(budgetId) &&
    cashBoundForSkip !== undefined &&
    (budget.sovereignCouponClaims?.length ?? 0) === 0 &&
    (batches?.length ?? 0) === 0 &&
    (prefetch.receiptClaimIdsByBudget.get(budgetId)?.size ?? 0) === 0 &&
    (prefetch.smallestOpenClaimAmountByBudget.get(budgetId) ?? Infinity) > cashBoundForSkip &&
    smallestFreshAmount > cashBoundForSkip;

  const loadedClaims = skipSettlementWork
    ? []
    : cashBound !== undefined
      ? await loadSettleableOpenSovereignCouponClaims(db, budgetId, cashBound, alsoClaimIds)
      : await loadOpenSovereignCouponClaims(db, budgetId);
  for (const claim of loadedClaims) claimById.set(claim.id, claim);

  if (fresh.length) {
    // A replayed install keeps the claim frozen the first time, and a claim
    // already paid stays paid.
    const existing = await claimStore(db)
      .find({ _id: { $in: fresh.map((row) => row._id) } })
      .toArray();
    const existingById = new Map(existing.map((row) => [row._id, row]));
    await insertClaimRecords(
      db,
      fresh.filter((row) => !existingById.has(row._id))
    );
    await db.collection<FederalBudget>("federalBudget").updateOne(
      { _id: budget._id },
      {
        $max: Object.fromEntries(
          fresh.map((row) => [
            `sovereignCouponFrozenThrough.b${row.claim.bondId}`,
            row.claim.dueTurn,
          ])
        ),
      }
    );
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
  const targetReadyClaimIds = skipSettlementWork
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
      if (resumed.status === "partial") return;
      if (!settlementLanded(resumed)) continue;
    }
    landed.push(batch);
    for (const id of batchMembers(batch)) batched.add(id);
  }
  await markBatchMembersSettled(
    db,
    budgetId,
    landed,
    claims.filter((claim) => batched.has(claim.id))
  );

  // Unpaid claims stay queued, so an unfunded Treasury carries one claim per
  // bond per turn of arrears. Attempting each through the journal writes a
  // rejected receipt and a failed guarded debit for every one of them, which
  // grows the phase without bound. Skip claims this snapshot of cash cannot
  // cover. The guarded debit remains the authority: a stale snapshot only
  // defers a claim one turn or lets the guard reject it as before. Read after
  // resumed batches, so their landed debits are not offered again.
  let fundableCash = 0;
  if (claims.length && !skipSettlementWork) {
    const cash = await db
      .collection<FederalBudget>("federalBudget")
      .findOne({ _id: budget._id }, { projection: { treasuryCashLocal: 1 } });
    const value = (cash as { treasuryCashLocal?: unknown } | null)?.treasuryCashLocal;
    fundableCash = typeof value === "number" && Number.isFinite(value) ? value : 0;
  }

  // At most one grouped receipt per Treasury and turn, holding at most
  // MAX_BATCH_CLAIMS claims. A claim that could join a batch but finds this
  // turn's batch already written or full stays owed for the next turn's batch,
  // so a replayed turn never falls back to one journal receipt per claim.
  const batchOpen = !batches.some((batch) => batch._id === couponBatchKey(budgetId, input.turn));
  const grouped: FundedSovereignCouponClaim[] = [];
  for (const claim of claims) {
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
      isBatchable(claim, budgetId, attempt) &&
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
      : await settleTransition(db, payoutTransition(claim, budgetId, attempt));
    if (result.status === "partial") return;
    if (!prior && result.status === "applied") fundableCash -= claim.amountLocal;
    // A wholly rejected source guard has no landed cash leg. Keep the immutable claim for the next turn.
  }
  if (grouped.length) {
    const transition = batchPayoutTransition(grouped, budgetId, input.turn);
    const result = await settleTransition(db, transition);
    if (result.status === "partial") return;
    if (settlementLanded(result)) {
      // A replay keeps the membership the receipt was first written with.
      const saved = await db
        .collection<CouponBatchRecord>("bankMoneyMoves")
        .findOne({ _id: transition.key }, { projection: BATCH_PROJECTION });
      if (saved && batchSettled(saved))
        await markBatchMembersSettled(db, budgetId, [saved], grouped);
    }
    // A rejected batch moved no cash, and a replay another attempt still owns
    // has not finished; either way its claims stay queued for the next turn.
  }

  // Paid records are only history once their receipt is acknowledged; keep
  // anything a journal may still publish to.
  await claimStore(db).deleteMany({
    budgetId,
    settledTurn: { $lt: input.turn },
    pendingSettlementProjection: { $exists: false },
  });
}

export type CouponBatchRecord = {
  _id: string;
  status?: string;
  projectionsCompletedAt?: Date;
  projections?: { applied?: boolean }[];
  event?: { meta?: { claimIds?: unknown } };
};

const BATCH_PROJECTION = {
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
  return db
    .collection<CouponBatchRecord>("bankMoneyMoves")
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
  const rows = await db
    .collection<CouponBatchRecord>("bankMoneyMoves")
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

/**
 * Close the claim records a landed batch paid. The receipt, not the record, is
 * the authority: a crash before this write leaves the record open and the next
 * attempt finds it in the batch membership and closes it here, paying nothing.
 */
async function markBatchMembersSettled(
  db: Db,
  budgetId: string,
  batches: CouponBatchRecord[],
  open: FundedSovereignCouponClaim[]
): Promise<void> {
  const openIds = new Set(open.map((claim) => claim.id));
  const ops = batches.flatMap((batch) => {
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
  if (ops.length) await claimStore(db).bulkWrite(ops, { ordered: false });
}

/**
 * Claims per grouped receipt. The receipt stores its member ids, so this bounds
 * the receipt document and the claim close-out write; a larger backlog drains
 * over the following turns.
 */
export const MAX_BATCH_CLAIMS = 2000;

/**
 * A claim may join a grouped receipt when every credit targets a document by id
 * alone and its own per-claim receipt balances. Corporate credits carry a payee
 * currency guard per claim, so they keep the per-claim receipt.
 */
function isBatchable(claim: FundedSovereignCouponClaim, budgetId: string, attempt: number) {
  if (claim.holders.some((holder) => holder.kind === "corporation")) return false;
  try {
    return checkBalancedTransfer(payoutTransition(claim, budgetId, attempt).legs).length === 0;
  } catch {
    return false;
  }
}

/**
 * One balanced receipt for many claims in one currency. It is the per-claim
 * receipts added together: one Treasury debit for the sum of the claims, and
 * one credit per payee holding the sum of that payee's per-claim credits, each
 * valued at the frozen quotes it summed. The debit is valued at the anchor sum
 * of the credits, so the receipt nets exactly. Each claim keeps its own frozen
 * quote on its record, and leaves the queue only after the receipt lands.
 */
function batchPayoutTransition(
  claims: FundedSovereignCouponClaim[],
  budgetId: string,
  turn: number
): BankingTransition {
  const currencyCode = claims[0].currencyCode;
  const credits = new Map<
    string,
    { leg: TransitionLeg; currencyCode: string; amount: number; anchor: number }
  >();
  const couponsIn = new Map<string, number>();
  let amount = 0;
  for (const claim of claims) {
    amount += claim.amountLocal;
    const single = payoutTransition(claim, budgetId, Math.max(turn, claim.dueTurn));
    for (const leg of single.legs) {
      if (leg.kind !== "credit" || !leg.valuation) continue;
      const target = `${leg.collection}|${String((leg.filter as { _id?: unknown })._id)}|${leg.path}|${leg.valuation.currencyCode}`;
      const row = credits.get(target) ?? {
        leg,
        currencyCode: leg.valuation.currencyCode,
        amount: 0,
        anchor: 0,
      };
      row.amount += leg.amount;
      row.anchor += leg.amount / leg.valuation.localPerAnchor;
      credits.set(target, row);
    }
    for (const holder of claim.holders) {
      if (holder.kind !== "publicFloat") continue;
      couponsIn.set(
        claim.currencyCode,
        (couponsIn.get(claim.currencyCode) ?? 0) + holder.amountLocal
      );
    }
  }
  let creditAnchor = 0;
  const creditLegs: TransitionLeg[] = [...credits.values()].map((row) => {
    creditAnchor += row.anchor;
    return {
      ...row.leg,
      amount: row.amount,
      valuation: { currencyCode: row.currencyCode, localPerAnchor: row.amount / row.anchor },
    };
  });
  return {
    key: couponBatchKey(budgetId, turn),
    kind: "sovereign_coupon_funded_batch_payout",
    turn,
    currency: currencyCode,
    legs: [
      {
        kind: "debit",
        amount,
        valuation: { currencyCode, localPerAnchor: amount / creditAnchor },
        collection: "federalBudget",
        filter: { _id: budgetId, treasuryCashLocal: { $gte: amount } },
        path: "treasuryCashLocal",
        note: "Pay sovereign coupon claims from funded Treasury cash",
      },
      ...creditLegs,
    ],
    projections: [...couponsIn].map(([pool, inc]) => ({
      collection: "bondMarketPools",
      filter: { _id: pool },
      update: { $inc: { "lifetime.couponsIn": inc } },
      note: "Record funded public-float coupon receipts",
    })),
    event: {
      kind: "monetary.executed",
      command: "turn.sovereignCoupon.fundedBatchPayout",
      subjectType: "country",
      subjectId: claims[0].countryId,
      amount,
      meta: { claimIds: claims.map((claim) => claim.id).join(","), claims: claims.length },
    },
  };
}

async function loadCouponTargetReadiness(
  db: Db,
  claims: FundedSovereignCouponClaim[],
  knownPoolCurrencies?: readonly string[]
): Promise<Set<string>> {
  // The pool upsert is a side effect that must not depend on which claims the
  // cash bound let this pass load, so a caller that pre-filtered passes the
  // currency set read from every open claim.
  const poolCurrencies = new Set<string>([
    ...(knownPoolCurrencies ?? []),
    ...claims.flatMap((claim) =>
      claim.holders.some((holder) => holder.kind === "publicFloat") ? [claim.currencyCode] : []
    ),
  ]);
  if (poolCurrencies.size > 0) {
    try {
      await db.collection<{ _id: string }>("bondMarketPools").bulkWrite(
        [...poolCurrencies].map((currencyCode) => ({
          updateOne: {
            filter: { _id: currencyCode },
            update: { $setOnInsert: { targetCashLocal: 0, createdAt: new Date() } },
            upsert: true,
          },
        })),
        { ordered: false }
      );
    } catch (error) {
      // Two Treasuries creating the same missing pool at once is the only way
      // this can race, and the loser's document is already the one it wanted.
      if (!isDuplicateKeyError(error)) throw error;
    }
  }
  const collections = new Map<string, Set<string>>();
  for (const claim of claims) {
    for (const holder of claim.holders) {
      if (!holder.id) continue;
      const collection = targetCollection(holder.kind);
      if (!collection) continue;
      const ids = collections.get(collection) ?? new Set<string>();
      ids.add(holder.id);
      collections.set(collection, ids);
    }
  }
  const foundIds = new Map<string, Set<string>>();
  const corporationsById = new Map<string, Corporation>();
  for (const [collection, ids] of collections) {
    const found =
      collection === "corporations"
        ? await db
            .collection<Corporation>(collection)
            .find(
              { _id: { $in: [...ids].map((id) => new ObjectId(id)) } },
              { projection: { _id: 1, countryId: 1, liquidCurrencyCode: 1 } }
            )
            .toArray()
        : await db
            .collection<{ _id: ObjectId }>(collection)
            .find(
              { _id: { $in: [...ids].map((id) => new ObjectId(id)) } },
              { projection: { _id: 1 } }
            )
            .toArray();
    foundIds.set(collection, new Set(found.map((row) => row._id.toHexString())));
    if (collection === "corporations") {
      for (const corp of found as Corporation[]) corporationsById.set(corp._id.toHexString(), corp);
    }
  }
  const ready = new Set<string>();
  for (const claim of claims) {
    const hasAllTargets = claim.holders.every((holder) => {
      if (holder.kind === "publicFloat") return poolCurrencies.has(claim.currencyCode);
      if (!holder.id) return false;
      const collection = targetCollection(holder.kind);
      if (!collection || !foundIds.get(collection)?.has(holder.id)) return false;
      if (holder.kind !== "corporation") return true;
      const corp = corporationsById.get(holder.id);
      return (
        !!corp &&
        resolveCorpLiquidCurrencyCode(corp) === holder.payeeCurrencyCode &&
        (holder.payeeCurrencyFieldPresent
          ? corp.liquidCurrencyCode === holder.payeeCurrencyFieldValue
          : corp.liquidCurrencyCode === undefined) &&
        (!holder.payeeCurrencyUsesCountryFallback ||
          String(corp.countryId ?? "") === holder.payeeCountryId)
      );
    });
    if (hasAllTargets) ready.add(claim.id);
  }
  return ready;
}

function targetCollection(
  kind: FundedSovereignCouponClaim["holders"][number]["kind"]
): string | null {
  if (kind === "character") return "characters";
  if (kind === "imperial") return "imperialCharacters";
  if (kind === "corporation") return "corporations";
  if (kind === "fund") return "indexFunds";
  if (kind === "npp") return "npps";
  return null;
}
