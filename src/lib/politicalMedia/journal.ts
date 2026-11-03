/**
 * Political advertising orders. Funding claims preserve the target, source,
 * payer currency and escrow before the debit starts; each seller receipt and
 * refund uses that original order record and a stable movement key.
 */

import { ObjectId, type AnyBulkWriteOperation, type Db, type Document } from "mongodb";
import {
  applyMoneyMove,
  MONEY_MOVE_COLLECTION,
  resumeMoneyMove,
  type MoneyMove,
  type MoneyMoveLeg,
  type MoneyMoveResult,
} from "@/lib/banking/moneyMove";
import { AD_BONUS_CAP, adExposure, type TargetedAd } from "@/lib/campaignTargeting/rules";
import { politicalMediaFillRatio } from "./rules";

export const POLITICAL_MEDIA_ORDER_KIND = "political-media-order";
const POLITICAL_MEDIA_ESCROW_CURRENCY = "AHD";
const POLITICAL_MEDIA_ESCROW_RATE = 1;

export type PoliticalMediaOrderSource = "advertise" | "targeted_ad" | "campaign_maintenance";

export type PoliticalMediaOrderEffect =
  | { kind: "none" }
  | {
      kind: "favorability";
      targetCollection: "characters" | "npps" | "electionCandidates";
      targetDocumentId: string;
      targetDocumentIdIsObjectId: boolean;
      amount: number;
    }
  | {
      kind: "targeted_ad";
      targetCollection: "characters" | "npps" | "electionCandidates";
      targetDocumentId: string;
      targetDocumentIdIsObjectId: boolean;
      ad: {
        stateId: string;
        dimension: string;
        bucket: string;
        bonus: number;
        lastPurchaseTurn: number;
      };
    };

export interface PoliticalMediaPayer {
  collection: "characters" | "campaigns";
  documentId: ObjectId | string;
  path: string;
  currencyCode: string;
  localPerAnchor: number;
  amountLocal: number;
  /** Present for player actions whose existing action-point cost is retained. */
  currentActions?: number;
  actionCost?: number;
}

export interface PoliticalMediaOrderIdentity {
  orderId: string;
  source: PoliticalMediaOrderSource;
  createdTurn: number;
  countryId: string;
  targetStateId: string;
  requestedAnchor: number;
  payer: {
    collection: PoliticalMediaPayer["collection"];
    documentId: string;
    documentIdIsObjectId: boolean;
    path: string;
    currencyCode: string;
    localPerAnchor: number;
    amountLocal: number;
    actionCost: number;
    currentActions: number | null;
  };

  details: Record<string, unknown>;
}

interface PoliticalMediaTargetDocument extends Document {
  _id: ObjectId | string;
  targetedAds?: TargetedAd[];
  targetedAdsRevision?: number;
}

function parsePoliticalMediaOrderEffect(raw: unknown): PoliticalMediaOrderEffect | null {
  if (typeof raw !== "object" || raw === null || !("kind" in raw)) return null;
  if (raw.kind === "none") return { kind: "none" };
  if (
    !("targetCollection" in raw) ||
    (raw.targetCollection !== "characters" &&
      raw.targetCollection !== "npps" &&
      raw.targetCollection !== "electionCandidates") ||
    !("targetDocumentId" in raw) ||
    typeof raw.targetDocumentId !== "string" ||
    raw.targetDocumentId.length === 0 ||
    !("targetDocumentIdIsObjectId" in raw) ||
    typeof raw.targetDocumentIdIsObjectId !== "boolean"
  )
    return null;

  const target: Pick<
    Extract<PoliticalMediaOrderEffect, { kind: "favorability" }>,
    "targetCollection" | "targetDocumentId" | "targetDocumentIdIsObjectId"
  > = {
    targetCollection: raw.targetCollection,
    targetDocumentId: raw.targetDocumentId,
    targetDocumentIdIsObjectId: raw.targetDocumentIdIsObjectId,
  };
  if (raw.kind === "favorability") {
    return "amount" in raw && typeof raw.amount === "number" && Number.isFinite(raw.amount)
      ? { kind: "favorability", ...target, amount: raw.amount }
      : null;
  }
  if (raw.kind !== "targeted_ad" || !("ad" in raw)) return null;
  const ad = raw.ad;
  if (
    typeof ad !== "object" ||
    ad === null ||
    !("stateId" in ad) ||
    typeof ad.stateId !== "string" ||
    !("dimension" in ad) ||
    typeof ad.dimension !== "string" ||
    !("bucket" in ad) ||
    typeof ad.bucket !== "string" ||
    !("bonus" in ad) ||
    typeof ad.bonus !== "number" ||
    !Number.isFinite(ad.bonus) ||
    !("lastPurchaseTurn" in ad) ||
    typeof ad.lastPurchaseTurn !== "number" ||
    !Number.isSafeInteger(ad.lastPurchaseTurn)
  )
    return null;
  return {
    kind: "targeted_ad",
    ...target,
    ad: {
      stateId: ad.stateId,
      dimension: ad.dimension,
      bucket: ad.bucket,
      bonus: ad.bonus,
      lastPurchaseTurn: ad.lastPurchaseTurn,
    },
  };
}

export interface PoliticalMediaSellerReceiptPlan {
  allocationId: string;
  sectorId: string;
  corporationId: string;
  units: number;
  amountAnchor: number;
  sellerLocalAmount: number;
  sellerCurrencyCode: string;
  sellerLocalPerAnchor: number;
}

export interface PoliticalMediaSettlementPlan {
  plannedTurn: number;
  deliveredAnchor: number;
  unfilledAnchor: number;
  deliveredUnits: number;
  sellers: PoliticalMediaSellerReceiptPlan[];
  /** Funded weak-effect spend credited to the target country's treasury when no outlet exists. */
  fallbackSpend?: {
    amountAnchor: number;
    countryId: string;
    budgetId: string;
    currencyCode: string;
    currencyCodePresent: boolean;
    rawCurrencyCode?: string | null;
    localPerAnchor: number;
    amountLocal: number;
    balancePath: "treasuryCashLocal" | "treasuryBalance";
  };
}

interface PoliticalMediaOrderRecord {
  status: "funding" | "open" | "settling" | "settled" | "rejected";
  escrowBalanceAnchor: number;
  identity: PoliticalMediaOrderIdentity;
  settlementPlan?: PoliticalMediaSettlementPlan;
  effectApplied?: boolean;
}

/** Which order one settlement record settles, for a return of undelivered cash. */
interface PoliticalMediaSettlementRecord {
  orderId: string;
  plannedTurn: number;
}

interface PoliticalMediaMoveRecord {
  _id: string;
  kind: string;
  status: string;
  error?: string;
  legs?: { applied?: boolean; refusal?: string }[];
  politicalMediaOrder?: PoliticalMediaOrderRecord;
  politicalMediaOrderIdentity?: unknown;
  politicalMediaSettlement?: PoliticalMediaSettlementRecord;
}

export interface PoliticalMediaOrderForClearing {
  orderId: string;
  identity: PoliticalMediaOrderIdentity;
  settlementPlan?: PoliticalMediaSettlementPlan;
  status: PoliticalMediaOrderRecord["status"];
  effectApplied?: boolean;
}

function persistedId(value: string, isObjectId: boolean): ObjectId | string {
  return isObjectId ? new ObjectId(value) : value;
}

function validateSettlementPlan(
  identity: PoliticalMediaOrderIdentity,
  plan: PoliticalMediaSettlementPlan
): void {
  const epsilon = 1e-7;
  const validNonnegative = (value: number) => Number.isFinite(value) && value >= 0;
  if (
    !Number.isSafeInteger(plan.plannedTurn) ||
    plan.plannedTurn < identity.createdTurn ||
    !validNonnegative(plan.deliveredAnchor) ||
    !validNonnegative(plan.unfilledAnchor) ||
    !validNonnegative(plan.deliveredUnits) ||
    Math.abs(plan.deliveredAnchor + plan.unfilledAnchor - identity.requestedAnchor) > epsilon
  )
    throw new Error(`Political media order ${identity.orderId} has an invalid settlement total.`);

  const allocationIds = new Set<string>();
  let sellerAnchor = 0;
  let sellerUnits = 0;
  const fallbackAnchor = plan.fallbackSpend?.amountAnchor ?? 0;
  if (
    !Number.isFinite(fallbackAnchor) ||
    fallbackAnchor < 0 ||
    (fallbackAnchor > 0 &&
      (!plan.fallbackSpend?.countryId ||
        plan.fallbackSpend.countryId !== identity.countryId ||
        !plan.fallbackSpend.budgetId ||
        !plan.fallbackSpend.currencyCode ||
        (plan.fallbackSpend.currencyCodePresent &&
          plan.fallbackSpend.rawCurrencyCode === undefined) ||
        (!plan.fallbackSpend.currencyCodePresent &&
          plan.fallbackSpend.rawCurrencyCode !== undefined) ||
        !Number.isFinite(plan.fallbackSpend.localPerAnchor) ||
        plan.fallbackSpend.localPerAnchor <= 0 ||
        !Number.isFinite(plan.fallbackSpend.amountLocal) ||
        plan.fallbackSpend.amountLocal <= 0 ||
        (plan.fallbackSpend.balancePath !== "treasuryCashLocal" &&
          plan.fallbackSpend.balancePath !== "treasuryBalance") ||
        Math.abs(
          plan.fallbackSpend.amountLocal - fallbackAnchor * plan.fallbackSpend.localPerAnchor
        ) >
          epsilon * Math.max(1, plan.fallbackSpend.amountLocal)))
  )
    throw new Error(`Political media order ${identity.orderId} has an invalid fallback receipt.`);
  for (const seller of plan.sellers) {
    if (
      !seller.allocationId ||
      !/^[A-Za-z0-9:_-]{1,160}$/.test(seller.allocationId) ||
      allocationIds.has(seller.allocationId) ||
      !seller.sectorId ||
      !seller.corporationId ||
      !Number.isFinite(seller.units) ||
      seller.units <= 0 ||
      !Number.isFinite(seller.amountAnchor) ||
      seller.amountAnchor <= 0 ||
      !Number.isFinite(seller.sellerLocalAmount) ||
      seller.sellerLocalAmount <= 0 ||
      !seller.sellerCurrencyCode.trim() ||
      !Number.isFinite(seller.sellerLocalPerAnchor) ||
      seller.sellerLocalPerAnchor <= 0 ||
      Math.abs(seller.sellerLocalAmount - seller.amountAnchor * seller.sellerLocalPerAnchor) >
        epsilon * Math.max(1, seller.sellerLocalAmount)
    )
      throw new Error(`Political media order ${identity.orderId} has an invalid seller receipt.`);
    allocationIds.add(seller.allocationId);
    sellerAnchor += seller.amountAnchor;
    sellerUnits += seller.units;
  }
  if (
    Math.abs(sellerAnchor + fallbackAnchor - plan.deliveredAnchor) > epsilon ||
    Math.abs(sellerUnits - plan.deliveredUnits) > epsilon
  )
    throw new Error(
      `Political media order ${identity.orderId} seller receipts do not match delivery.`
    );
}

/** A move's disposition plus the legs that durably landed. */
interface AppliedMove {
  status: MoneyMoveResult["status"];
  applied: Set<number>;
  error?: string;
}

/**
 * Finish one settlement move from its own journal.
 *
 * A move this call just claimed cannot be read back from its result alone: a
 * `replayed` answer carries no legs, and the owner of a key may have stopped
 * half way. Only a replay pays for the extra read, and only a record still in
 * flight is resumed, so a completed order settles without touching its journal.
 */
async function settleMove(db: Db, move: MoneyMove): Promise<AppliedMove> {
  let result = await applyMoneyMove(db, move);
  if (result.status === "partial") result = await resumeMoneyMove(db, move.key);
  if (result.status !== "replayed") {
    return { status: result.status, applied: new Set(result.applied), error: result.error };
  }
  const record = await db
    .collection<PoliticalMediaMoveRecord>(MONEY_MOVE_COLLECTION)
    .findOne(
      { _id: move.key },
      { projection: { status: 1, error: 1, "legs.applied": 1, "legs.refusal": 1 } }
    );
  if (!record)
    return { status: "rejected", applied: new Set(), error: `no money move ${move.key}` };
  if (record.status === "partial") {
    result = await resumeMoneyMove(db, move.key);
    return { status: result.status, applied: new Set(result.applied), error: result.error };
  }
  const legs = record.legs ?? [];
  if (record.status !== "applied")
    return {
      status: "rejected",
      applied: new Set(),
      error: record.error ?? `money move ${move.key} was ${record.status ?? "rejected"}`,
    };
  return {
    status: "applied",
    applied: new Set(legs.flatMap((leg, index) => (leg.applied ? [index] : []))),
  };
}

export function politicalMediaOrderKey(orderId: string): string {
  return `political-media-order:${orderId}`;
}

function validatedIdentity(args: {
  orderId: string;
  source: PoliticalMediaOrderSource;
  createdTurn: number;
  countryId: string;
  targetStateId: string;
  payer: PoliticalMediaPayer;
  details: Record<string, unknown>;
}): PoliticalMediaOrderIdentity {
  const { payer } = args;
  if (
    !/^[A-Za-z0-9:_-]{1,160}$/.test(args.orderId) ||
    !args.countryId ||
    !args.targetStateId ||
    !Number.isSafeInteger(args.createdTurn) ||
    args.createdTurn < 0 ||
    !Number.isFinite(payer.amountLocal) ||
    payer.amountLocal <= 0 ||
    !Number.isFinite(payer.localPerAnchor) ||
    payer.localPerAnchor <= 0 ||
    !payer.currencyCode.trim() ||
    !payer.path.trim() ||
    (payer.actionCost !== undefined &&
      (!Number.isSafeInteger(payer.actionCost) || payer.actionCost < 0)) ||
    (payer.currentActions !== undefined &&
      (!Number.isFinite(payer.currentActions) || payer.currentActions < 0)) ||
    ((payer.actionCost ?? 0) > 0 && payer.currentActions === undefined)
  )
    throw new Error("Political media order has an invalid source, target or payer quote.");

  return {
    orderId: args.orderId,
    source: args.source,
    createdTurn: args.createdTurn,
    countryId: args.countryId,
    targetStateId: args.targetStateId,
    requestedAnchor: payer.amountLocal / payer.localPerAnchor,
    payer: {
      collection: payer.collection,
      documentId: String(payer.documentId),
      documentIdIsObjectId: payer.documentId instanceof ObjectId,
      path: payer.path,
      currencyCode: payer.currencyCode,
      localPerAnchor: payer.localPerAnchor,
      amountLocal: payer.amountLocal,
      actionCost: payer.actionCost ?? 0,
      currentActions: payer.currentActions ?? null,
    },
    details: args.details,
  };
}

/**
 * Claim a durable target-state order, then debit its payer and credit anchor
 * escrow through one replay-safe money-move record.
 */
export async function fundPoliticalMediaOrder(
  db: Db,
  args: {
    orderId: string;
    source: PoliticalMediaOrderSource;
    createdTurn: number;
    countryId: string;
    targetStateId: string;
    payer: PoliticalMediaPayer;
    details?: Record<string, unknown>;
  }
): Promise<MoneyMoveResult> {
  const identity = validatedIdentity({ ...args, details: args.details ?? {} });
  const key = politicalMediaOrderKey(identity.orderId);
  const actions = identity.payer.actionCost;
  if (actions > 0 && (identity.payer.currentActions ?? 0) < actions) {
    return { status: "rejected", applied: [], error: "Insufficient actions for the media order" };
  }
  const payerFilter: Record<string, unknown> = { _id: args.payer.documentId };
  payerFilter[identity.payer.path] = { $gte: identity.payer.amountLocal };
  if (actions > 0) payerFilter.actions = identity.payer.currentActions;
  const payerSet =
    actions > 0 ? { actions: (identity.payer.currentActions ?? 0) - actions } : undefined;
  const order: PoliticalMediaOrderRecord = {
    status: "funding",
    escrowBalanceAnchor: 0,
    identity,
  };
  const move: MoneyMove = {
    key,
    kind: POLITICAL_MEDIA_ORDER_KIND,
    turn: identity.createdTurn,
    quoteIdentity: identity,
    record: {
      politicalMediaOrder: order,
      politicalMediaOrderIdentity: identity,
    },
    legs: [
      {
        kind: "debit",
        amount: args.payer.amountLocal,
        valuation: {
          currencyCode: args.payer.currencyCode,
          localPerAnchor: args.payer.localPerAnchor,
        },
        collection: args.payer.collection,
        filter: payerFilter,
        path: args.payer.path,
        ...(payerSet ? { set: payerSet } : {}),
        note: `fund ${identity.source} political advertising order ${identity.orderId}`,
      },
      {
        kind: "credit",
        amount: identity.requestedAnchor,
        valuation: {
          currencyCode: POLITICAL_MEDIA_ESCROW_CURRENCY,
          localPerAnchor: POLITICAL_MEDIA_ESCROW_RATE,
        },
        collection: MONEY_MOVE_COLLECTION,
        filter: { _id: key },
        path: "politicalMediaOrder.escrowBalanceAnchor",
        set: { "politicalMediaOrder.status": "open" },
        note: `credit escrow for political advertising order ${identity.orderId}`,
      },
    ],
  };
  const result = await applyMoneyMove(db, move);
  if (result.status === "rejected" && result.applied.length === 0) {
    await db
      .collection<PoliticalMediaMoveRecord>(MONEY_MOVE_COLLECTION)
      .updateOne(
        { _id: key, kind: POLITICAL_MEDIA_ORDER_KIND, status: "rejected" },
        { $set: { "politicalMediaOrder.status": "rejected" } }
      );
  }
  return result;
}

/** Resume a claim-first funding intent after a process stopped mid-transfer. */
export function resumePoliticalMediaOrderFunding(db: Db, orderId: string) {
  return resumeMoneyMove(db, politicalMediaOrderKey(orderId));
}

/** Call only after the political media feature gate is enabled. */
export async function loadPoliticalMediaOrdersForClearing(
  db: Db,
  currentTurn: number
): Promise<PoliticalMediaOrderForClearing[]> {
  const rows = await db
    .collection<PoliticalMediaMoveRecord>(MONEY_MOVE_COLLECTION)
    .find(
      {
        kind: POLITICAL_MEDIA_ORDER_KIND,
        status: "applied",
        $or: [
          { "politicalMediaOrder.status": { $in: ["open", "settling"] } },
          {
            "politicalMediaOrder.settlementPlan.plannedTurn": currentTurn,
          },
        ],
      },
      { projection: { _id: 1, kind: 1, status: 1, politicalMediaOrder: 1 } }
    )
    .toArray();
  return rows.flatMap((row) => {
    const order = row.politicalMediaOrder;
    if (!order) return [];
    return [
      {
        orderId: order.identity.orderId,
        identity: order.identity,
        ...(order.settlementPlan ? { settlementPlan: order.settlementPlan } : {}),
        status: order.status,
        ...(order.effectApplied !== undefined ? { effectApplied: order.effectApplied } : {}),
      },
    ];
  });
}

/**
 * Persist the exact clearing allocation before sector P&L writes. Replays use
 * this first plan, including seller-local amounts and captured rates.
 */
export async function savePoliticalMediaSettlementPlan(
  db: Db,
  orderId: string,
  plan: PoliticalMediaSettlementPlan
): Promise<PoliticalMediaSettlementPlan> {
  const saved = await savePoliticalMediaSettlementPlans(db, [{ orderId, plan }]);
  return saved.get(orderId) ?? plan;
}

/**
 * The whole turn's plans in three round trips instead of two per order.
 *
 * Each plan keeps exactly the guards the per-order saver applied: the order must
 * have funded (status `applied`), the plan must validate against the order's
 * frozen identity, an order that already carries a plan keeps its own copy, and
 * the write is a compare-and-set on (applied, open, no plan). A compare-and-set
 * that loses is answered by re-reading that order once, exactly as before, and a
 * stored plan that disagrees with the one offered still wins.
 */
export async function savePoliticalMediaSettlementPlans(
  db: Db,
  plans: readonly { orderId: string; plan: PoliticalMediaSettlementPlan }[]
): Promise<Map<string, PoliticalMediaSettlementPlan>> {
  const saved = new Map<string, PoliticalMediaSettlementPlan>();
  if (plans.length === 0) return saved;
  const orders = db.collection<PoliticalMediaMoveRecord>(MONEY_MOVE_COLLECTION);
  const keys = plans.map((entry) => politicalMediaOrderKey(entry.orderId));
  const stored = new Map(
    (
      await orders
        .find(
          { _id: { $in: keys }, kind: POLITICAL_MEDIA_ORDER_KIND },
          {
            projection: {
              status: 1,
              "politicalMediaOrder.identity": 1,
              "politicalMediaOrder.settlementPlan": 1,
            },
          }
        )
        .toArray()
    ).map((row) => [row._id, row])
  );

  const pending: { key: string; orderId: string; plan: PoliticalMediaSettlementPlan }[] = [];
  // Validated in input order, so the first bad plan raises the same error the
  // per-order loop raised, before anything is written.
  for (let index = 0; index < plans.length; index++) {
    const { orderId, plan } = plans[index];
    const key = keys[index];
    const row = stored.get(key);
    if (!row || row.status !== "applied" || !row.politicalMediaOrder)
      throw new Error(`Political media order ${orderId} is not fully funded.`);
    validateSettlementPlan(row.politicalMediaOrder.identity, plan);
    const existing = row.politicalMediaOrder.settlementPlan;
    if (existing) saved.set(orderId, existing);
    else pending.push({ key, orderId, plan });
  }
  if (pending.length === 0) return saved;

  await orders.bulkWrite(
    pending.map(({ key, plan }) => ({
      updateOne: {
        filter: {
          _id: key,
          kind: POLITICAL_MEDIA_ORDER_KIND,
          status: "applied",
          "politicalMediaOrder.status": "open",
          "politicalMediaOrder.settlementPlan": { $exists: false },
        },
        update: {
          $set: {
            "politicalMediaOrder.status": "settling",
            "politicalMediaOrder.settlementPlan": plan,
          },
        },
      },
    })),
    { ordered: false }
  );

  // A compare-and-set that did not modify was claimed by someone else; their
  // stored plan is authoritative for that order.
  const reread = new Map(
    (
      await orders
        .find(
          { _id: { $in: pending.map((entry) => entry.key) } },
          { projection: { "politicalMediaOrder.settlementPlan": 1 } }
        )
        .toArray()
    ).map((row) => [row._id, row])
  );
  for (const { key, orderId } of pending) {
    const row = reread.get(key);
    const durable = row?.politicalMediaOrder?.settlementPlan;
    if (!durable)
      throw new Error(`Political media order ${orderId} has no durable settlement plan.`);
    saved.set(orderId, durable);
  }
  return saved;
}

/** Payout a plan saved on the order, then return its unfilled escrow once. */
export async function settlePoliticalMediaOrder(
  db: Db,
  orderId: string,
  turn: number
): Promise<MoneyMoveResult[]> {
  const key = politicalMediaOrderKey(orderId);
  const orders = db.collection<PoliticalMediaMoveRecord>(MONEY_MOVE_COLLECTION);
  const order = await orders.findOne({ _id: key, kind: POLITICAL_MEDIA_ORDER_KIND });
  const saved = order?.politicalMediaOrder;
  if (!order || order.status !== "applied" || !saved?.settlementPlan)
    throw new Error(`Political media order ${orderId} has no funded settlement plan.`);
  return settleLoadedPoliticalMediaOrder(db, { ...saved, orderId }, turn);
}

/** One order's settlement outcome, as the turn loop consumes it. */
export interface PoliticalMediaSettlementOutcome {
  /** One result per seller allocation in plan order; a paid allocation is applied. */
  results: MoneyMoveResult[];
  /** True when the order's escrow was spent and the order counts as settled. */
  settled: boolean;
}

/** Stable key for one order's whole settlement, instead of a move per seller. */
function politicalMediaSettlementKey(orderId: string, plannedTurn: number): string {
  return `political-media-settlement:${orderId}:${plannedTurn}`;
}

/**
 * How far the payer refund may sit from the plan's unfilled anchor before it is
 * worth a leg. Funding credited the exact requested anchor, so the escrow is
 * spent whole and a residue below this stays in escrow instead of being paid out
 * as dust.
 */
const SETTLEMENT_DUST_ANCHOR = 1e-9;

interface BuiltSettlementMove {
  move: MoneyMove;
  /** Leg index carrying each plan seller's credit, in plan order, or -1 if it has no target. */
  sellerLegIndex: number[];
  /** True when a credit target was gone, so the move stops before it and the order stays open. */
  truncated: boolean;
}

/**
 * Collections a settlement can credit, in the closed set a plan can name: the
 * paying corporation, the no-outlet budget and the payer's own account.
 */
type PoliticalMediaCreditCollection = "corporations" | "federalBudget" | "characters" | "campaigns";

const POLITICAL_MEDIA_CREDIT_COLLECTIONS: readonly PoliticalMediaCreditCollection[] = [
  "corporations",
  "federalBudget",
  "characters",
  "campaigns",
];

/** A credit target, as the preflight remembers which ones were not there. */
function creditTargetKey(collection: string, id: unknown): string {
  return `${collection}\u0000${String(id)}`;
}

/** One `$in` read of the ids a collection does hold. Bounded by the whole cohort. */
async function existingTargetIds(
  db: Db,
  collection: PoliticalMediaCreditCollection,
  ids: readonly unknown[]
): Promise<Set<string>> {
  const rows = await db
    .collection<PoliticalMediaTargetDocument>(collection)
    .find({ _id: { $in: [...ids] } } as never, { projection: { _id: 1 } })
    .toArray();
  return new Set(rows.map((row) => creditTargetKey(collection, row._id)));
}

/**
 * How many of these targets still hold this move's delivery receipt.
 *
 * A receipt that is still stamped means the leg may have landed even though the
 * journal does not say so yet, so the answer decides between finishing the move
 * and leaving it to reconciliation. One count per credited collection.
 */
async function countInFlightReceipts(
  db: Db,
  collection: PoliticalMediaCreditCollection,
  ids: readonly unknown[],
  key: string
): Promise<number> {
  return db
    .collection<PoliticalMediaTargetDocument>(collection)
    .countDocuments({ _id: { $in: [...ids] }, "pendingMoneyMoveReceipt.key": key } as never);
}

/**
 * Read the documents this pass is about to credit, once for the whole cohort.
 *
 * A plan can name a seller whose corporation is gone, or a payer whose account
 * was closed. The per-seller settlement found that out by refusing the credit
 * after the escrow had already been debited for it, and the order then needed a
 * second pass to finish around the hole. Knowing it before the move is claimed
 * keeps the anchor of an undeliverable allocation in its escrow from the start,
 * which is exactly where the retried per-seller path left it, and it costs one
 * read per credited collection for the whole turn instead of one refusal per
 * order.
 */
async function loadMissingSettlementTargets(
  db: Db,
  orders: readonly Pick<PoliticalMediaOrderForClearing, "orderId" | "identity" | "settlementPlan">[]
): Promise<Set<string>> {
  const idsByCollection = new Map<PoliticalMediaCreditCollection, Set<unknown>>();
  const wanted = (collection: PoliticalMediaCreditCollection, id: unknown) => {
    const ids = idsByCollection.get(collection) ?? new Set<unknown>();
    ids.add(id);
    idsByCollection.set(collection, ids);
  };
  for (const order of orders) {
    const plan = order.settlementPlan;
    if (!plan) continue;
    for (const seller of plan.sellers)
      wanted(
        "corporations",
        persistedId(seller.corporationId, ObjectId.isValid(seller.corporationId))
      );
    const fallback = plan.fallbackSpend;
    if (fallback && fallback.amountAnchor > 0) wanted("federalBudget", fallback.budgetId);
    const payer = order.identity.payer;
    wanted(payer.collection, persistedId(payer.documentId, payer.documentIdIsObjectId));
  }
  const missing = new Set<string>();
  for (const [collection, ids] of idsByCollection) {
    const found = await existingTargetIds(db, collection, [...ids]);
    for (const id of ids) {
      const key = creditTargetKey(collection, id);
      if (!found.has(key)) missing.add(key);
    }
  }
  return missing;
}

/**
 * One journaled move for a whole order: the escrow leaves once, and each payee
 * is credited once.
 *
 * The per-allocation settlement spent one move per seller receipt, each with its
 * own debit from the same escrow document, so an order that paid N sellers
 * landed N receipts at thirteen round trips each. This move pays the same plan
 * through one receipt: a single debit guarded by the same escrow balance, one
 * credit per payee, the no-outlet fallback and the payer refund. Every leg nets
 * to zero and every balance guard is the one the per-seller path used.
 *
 * Credits are declared in the order the per-seller path paid them: the plan's
 * sellers, then the no-outlet fallback, then the unfilled refund. A credit whose
 * target document is gone stops the list there, so the move spends exactly what
 * the per-seller path would have spent before the same refusal, and an order
 * that stopped short keeps its settling status instead of closing over a hole.
 */
function settlementMove(
  order: Pick<PoliticalMediaOrderForClearing, "orderId" | "identity" | "settlementPlan"> & {
    settlementPlan: PoliticalMediaSettlementPlan;
  },
  turn: number,
  missing: ReadonlySet<string>
): BuiltSettlementMove {
  const { orderId, identity } = order;
  const plan = order.settlementPlan;
  const orderKey = politicalMediaOrderKey(orderId);
  const payer = identity.payer;
  const payerId = persistedId(payer.documentId, payer.documentIdIsObjectId);
  const fallback = plan.fallbackSpend;
  const fallbackAnchor = fallback && fallback.amountAnchor > 0 ? fallback.amountAnchor : 0;
  const sellerAnchor = plan.sellers.reduce((sum, seller) => sum + seller.amountAnchor, 0);
  const residual = identity.requestedAnchor - sellerAnchor - fallbackAnchor;
  const refundAnchor = residual > SETTLEMENT_DUST_ANCHOR ? residual : 0;

  const intents: { target: string; leg: MoneyMoveLeg }[] = [];
  const sellerIntent: number[] = [];
  // One credit per payee: two allocations paid to one corporation in one
  // currency are one transfer carrying both allocations' receipts.
  const payeeIntent = new Map<string, number>();
  for (const seller of plan.sellers) {
    const sellerId = persistedId(seller.corporationId, ObjectId.isValid(seller.corporationId));
    const payeeKey = `${seller.corporationId}\u0000${seller.sellerCurrencyCode}\u0000${seller.sellerLocalPerAnchor}`;
    const existing = payeeIntent.get(payeeKey);
    if (existing !== undefined) {
      const leg = intents[existing].leg;
      leg.amount += seller.sellerLocalAmount;
      leg.set = {
        ...leg.set,
        [`politicalMediaReceipts.${orderId}.${seller.allocationId}`]: settlementReceipt({
          orderId,
          identity,
          seller,
        }),
      };
      sellerIntent.push(existing);
      continue;
    }
    const index = intents.length;
    payeeIntent.set(payeeKey, index);
    intents.push({
      target: creditTargetKey("corporations", sellerId),
      leg: {
        kind: "credit",
        amount: seller.sellerLocalAmount,
        valuation: {
          currencyCode: seller.sellerCurrencyCode,
          localPerAnchor: seller.sellerLocalPerAnchor,
        },
        collection: "corporations",
        filter: { _id: sellerId },
        path: "liquidCapital",
        set: {
          [`politicalMediaReceipts.${orderId}.${seller.allocationId}`]: settlementReceipt({
            orderId,
            identity,
            seller,
          }),
        },
        note: `political advertising receipt for order ${orderId}`,
      },
    });
    sellerIntent.push(index);
  }
  if (fallback && fallbackAnchor > 0) {
    const rawCurrencyGuard = fallback.currencyCodePresent
      ? [{ currencyCode: { $exists: true } }, { currencyCode: fallback.rawCurrencyCode }]
      : [{ currencyCode: { $exists: false } }];
    intents.push({
      target: creditTargetKey("federalBudget", fallback.budgetId),
      leg: {
        kind: "credit",
        amount: fallback.amountLocal,
        valuation: {
          currencyCode: fallback.currencyCode,
          localPerAnchor: fallback.localPerAnchor,
        },
        collection: "federalBudget",
        filter: {
          _id: fallback.budgetId,
          countryId: fallback.countryId,
          $and: rawCurrencyGuard,
        },
        path: fallback.balancePath,
        note: `credit local no-outlet broadcaster fund for political advertising order ${orderId}`,
      },
    });
  }
  if (refundAnchor > 0) {
    intents.push({
      target: creditTargetKey(payer.collection, payerId),
      leg: {
        kind: "credit",
        amount: refundAnchor * payer.localPerAnchor,
        valuation: {
          currencyCode: payer.currencyCode,
          localPerAnchor: payer.localPerAnchor,
        },
        collection: payer.collection,
        filter: { _id: payerId },
        path: payer.path,
        note: `refund unfilled political advertising order ${orderId}`,
      },
    });
  }
  const cut = intents.findIndex((intent) => missing.has(intent.target));
  const kept = cut >= 0 ? intents.slice(0, cut) : intents;
  const credits = kept.map((intent) => intent.leg);
  const sellerLegIndex = sellerIntent.map((index) => (kept[index] ? index + 1 : -1));
  const debitAmount = credits.reduce(
    (sum, leg) => sum + leg.amount / (leg.valuation?.localPerAnchor ?? 1),
    0
  );

  const quoteIdentity = {
    orderId,
    plannedTurn: plan.plannedTurn,
    targetStateId: identity.targetStateId,
    deliveredAnchor: plan.deliveredAnchor,
    unfilledAnchor: plan.unfilledAnchor,
    deliveredUnits: plan.deliveredUnits,
    refundAnchor,
    sellers: plan.sellers.map((seller) => ({
      allocationId: seller.allocationId,
      sectorId: seller.sectorId,
      corporationId: seller.corporationId,
      units: seller.units,
      amountAnchor: seller.amountAnchor,
      sellerLocalAmount: seller.sellerLocalAmount,
      sellerCurrencyCode: seller.sellerCurrencyCode,
      sellerLocalPerAnchor: seller.sellerLocalPerAnchor,
    })),
    fallbackSpend: plan.fallbackSpend ?? null,
    unpayableCredits: intents.slice(kept.length).map((intent) => intent.target),
  };
  // Every credit was undeliverable, so there is nothing to move and no receipt to
  // claim: the order simply stays open with its escrow untouched.
  const legs: MoneyMoveLeg[] =
    debitAmount > 0
      ? [
          {
            kind: "debit",
            amount: debitAmount,
            valuation: {
              currencyCode: POLITICAL_MEDIA_ESCROW_CURRENCY,
              localPerAnchor: POLITICAL_MEDIA_ESCROW_RATE,
            },
            collection: MONEY_MOVE_COLLECTION,
            filter: { _id: orderKey, kind: POLITICAL_MEDIA_ORDER_KIND, status: "applied" },
            path: "politicalMediaOrder.escrowBalanceAnchor",
            note: `spend escrow for political advertising order ${orderId}`,
          },
          ...credits,
        ]
      : [];
  return {
    truncated: cut >= 0,
    move: {
      key: politicalMediaSettlementKey(orderId, plan.plannedTurn),
      kind: "political-media-settlement",
      turn,
      quoteIdentity,
      record: {
        politicalMediaOrderIdentity: quoteIdentity,
        politicalMediaSettlement: { orderId, plannedTurn: plan.plannedTurn },
      },
      legs,
    },
    sellerLegIndex,
  };
}

/** The receipt one seller allocation leaves on the corporation it is paid to. */
function settlementReceipt(args: {
  orderId: string;
  identity: PoliticalMediaOrderIdentity;
  seller: PoliticalMediaSellerReceiptPlan;
}): Record<string, unknown> {
  return {
    orderId: args.orderId,
    allocationId: args.seller.allocationId,
    targetStateId: args.identity.targetStateId,
    sectorId: args.seller.sectorId,
    corporationId: args.seller.corporationId,
    units: args.seller.units,
    amountAnchor: args.seller.amountAnchor,
    sellerLocalAmount: args.seller.sellerLocalAmount,
    sellerCurrencyCode: args.seller.sellerCurrencyCode,
    sellerLocalPerAnchor: args.seller.sellerLocalPerAnchor,
  };
}

/**
 * Give back the anchor of every credit leg that did not land.
 *
 * The preflight keeps a target that no longer exists out of the move, so a
 * credit still undelivered here is one its own document refused: a contended
 * generation, or a currency guard on the no-outlet fund. Its escrow was debited
 * for it, so the amount goes back through its own keyed receipt and the order
 * settles with that allocation unpaid. The anchor stays visible in escrow rather
 * than being retried against a guard that just rejected it, which is where the
 * per-seller path converged after the same refusal. A credit whose delivery
 * receipt is still stamped may have landed, so only reconciliation may decide
 * that one and the order stays open for another pass.
 */
async function returnUndeliveredCredits(
  db: Db,
  orderKey: string,
  move: MoneyMove,
  applied: ReadonlySet<number>,
  turn: number
): Promise<boolean> {
  const undelivered = move.legs.flatMap((leg, index) =>
    leg.kind === "credit" && !applied.has(index) ? [leg] : []
  );
  if (undelivered.length === 0) return true;
  const byCollection = new Map<PoliticalMediaCreditCollection, unknown[]>();
  for (const leg of undelivered) {
    const collection = leg.collection as PoliticalMediaCreditCollection | undefined;
    if (
      !collection ||
      !POLITICAL_MEDIA_CREDIT_COLLECTIONS.includes(collection) ||
      leg.filter?._id === undefined
    )
      return false;
    const ids = byCollection.get(collection) ?? [];
    ids.push(leg.filter._id);
    byCollection.set(collection, ids);
  }
  for (const [collection, ids] of byCollection) {
    if ((await countInFlightReceipts(db, collection, ids, move.key)) > 0) return false;
  }
  const amount = undelivered.reduce(
    (sum, leg) => sum + leg.amount / (leg.valuation?.localPerAnchor ?? 1),
    0
  );
  if (!(amount > 0)) return true;
  const returned = await settleMove(db, {
    key: `${move.key}:return`,
    kind: "political-media-settlement-return",
    turn,
    quoteIdentity: { settlement: move.key, amountAnchor: amount },
    record: {
      politicalMediaSettlement: move.record?.politicalMediaSettlement,
      politicalMediaSettlementReturn: { settlement: move.key, amountAnchor: amount },
    },
    legs: [
      {
        kind: "credit",
        amount,
        valuation: {
          currencyCode: POLITICAL_MEDIA_ESCROW_CURRENCY,
          localPerAnchor: POLITICAL_MEDIA_ESCROW_RATE,
        },
        collection: MONEY_MOVE_COLLECTION,
        filter: { _id: orderKey, kind: POLITICAL_MEDIA_ORDER_KIND, status: "applied" },
        path: "politicalMediaOrder.escrowBalanceAnchor",
        note: "return undelivered political advertising cash to escrow",
      },
      {
        kind: "mint",
        amount,
        valuation: {
          currencyCode: POLITICAL_MEDIA_ESCROW_CURRENCY,
          localPerAnchor: POLITICAL_MEDIA_ESCROW_RATE,
        },
        note: "contra for the undelivered part of this settlement",
      },
    ],
  });
  // A return that could not land leaves the order open, so the next pass finishes
  // it rather than closing the order over cash that is still in the journal.
  return returned.status === "applied";
}

/**
 * Settle the orders the turn already loaded for clearing.
 *
 * One journaled move per order, one settlement mark per cohort: the orders are
 * loaded once, each pays its plan through a single receipt, and every order that
 * finished is closed by one bulk write instead of one update each.
 */
export async function settleLoadedPoliticalMediaOrders(
  db: Db,
  orders: readonly Pick<
    PoliticalMediaOrderForClearing,
    "orderId" | "status" | "identity" | "settlementPlan"
  >[],
  turn: number
): Promise<Map<string, PoliticalMediaSettlementOutcome>> {
  const outcomes = new Map<string, PoliticalMediaSettlementOutcome>();
  const settledKeys: string[] = [];
  const missing = await loadMissingSettlementTargets(db, orders);
  for (const order of orders) {
    const outcome = await settleLoadedOrder(db, order, turn, missing);
    outcomes.set(order.orderId, outcome);
    if (outcome.settled && order.status !== "settled")
      settledKeys.push(politicalMediaOrderKey(order.orderId));
  }
  if (settledKeys.length > 0) {
    await db.collection<PoliticalMediaMoveRecord>(MONEY_MOVE_COLLECTION).bulkWrite(
      settledKeys.map((key) => ({
        updateOne: {
          filter: { _id: key, kind: POLITICAL_MEDIA_ORDER_KIND, status: "applied" },
          update: { $set: { "politicalMediaOrder.status": "settled" } },
        },
      })),
      { ordered: false }
    );
  }
  return outcomes;
}

async function settleLoadedOrder(
  db: Db,
  order: Pick<PoliticalMediaOrderForClearing, "orderId" | "status" | "identity" | "settlementPlan">,
  turn: number,
  missing: ReadonlySet<string>
): Promise<PoliticalMediaSettlementOutcome> {
  const { orderId } = order;
  const plan = order.settlementPlan;
  if (!plan) throw new Error(`Political media order ${orderId} has no funded settlement plan.`);
  if (order.status === "settled") return { results: [], settled: true };
  const built = settlementMove({ ...order, settlementPlan: plan }, turn, missing);
  if (built.move.legs.length === 0)
    return {
      results: plan.sellers.map(() => ({ status: "rejected" as const, applied: [] })),
      settled: false,
    };
  const paid = await settleMove(db, built.move);
  const applied = new Set(paid.applied);
  // Every leg landed: the escrow spent what it owed and the order is settled.
  // An order whose plan reached a credit it cannot deliver stays open, exactly
  // where the per-seller path stopped when the same receipt was refused.
  let settled = !built.truncated && applied.size === built.move.legs.length;
  if (!settled && !built.truncated && applied.has(0)) {
    // The escrow left in full, so the anchor of each credit that did not land
    // goes back into it and the order settles with that allocation unpaid.
    settled = await returnUndeliveredCredits(
      db,
      politicalMediaOrderKey(orderId),
      built.move,
      applied,
      turn
    );
  }
  // The escrow debit itself did not land, so no cash moved and the plan stays
  // owed; the order keeps its settling status and is retried next turn.
  const results: MoneyMoveResult[] = plan.sellers.map((_, index) => {
    const leg = built.sellerLegIndex[index];
    return applied.has(leg)
      ? { status: "applied", applied: [leg] }
      : { status: "rejected", applied: [] };
  });
  return { results, settled };
}

/** Settle one order the turn loaded for clearing, for callers that have just one. */
export async function settleLoadedPoliticalMediaOrder(
  db: Db,
  order: Pick<PoliticalMediaOrderForClearing, "orderId" | "status" | "identity" | "settlementPlan">,
  turn: number
): Promise<MoneyMoveResult[]> {
  const outcomes = await settleLoadedPoliticalMediaOrders(db, [order], turn);
  return outcomes.get(order.orderId)?.results ?? [];
}

/** Apply a fully paid order's game effect once, after its seller receipts land. */
export async function applyPoliticalMediaOrderEffect(db: Db, orderId: string): Promise<boolean> {
  const key = politicalMediaOrderKey(orderId);
  const orders = db.collection<PoliticalMediaMoveRecord>(MONEY_MOVE_COLLECTION);
  const record = await orders.findOne({
    _id: key,
    kind: POLITICAL_MEDIA_ORDER_KIND,
    status: "applied",
  });
  if (!record?.politicalMediaOrder) return false;
  return applyPoliticalMediaOrderEffectToOrder(db, orderId, record.politicalMediaOrder);
}

/** The documents a political media effect can land on. */
type PoliticalMediaTargetCollection = Extract<
  PoliticalMediaOrderEffect,
  { kind: "favorability" }
>["targetCollection"];

/**
 * Raise every listed document's favour by its own amount, one round trip.
 *
 * Each write carries the order's receipt path in the same update, so a replayed
 * pass recognises a document that already took the effect. Bounded by the number
 * of orders in the cohort, across the at most three target collections.
 */
async function applyFavourabilityBulk(
  db: Db,
  collection: PoliticalMediaTargetCollection,
  writes: AnyBulkWriteOperation<PoliticalMediaTargetDocument>[]
): Promise<number> {
  const result = await db
    .collection<PoliticalMediaTargetDocument>(collection)
    .bulkWrite(writes, { ordered: false });
  return result.matchedCount;
}

/**
 * Apply the effects of many orders with one read for the whole set.
 *
 * The per-order entry point re-read the full 97 KB money-move record for each
 * order, and the turn then called it for every order it had loaded. One `$in`
 * read of the affected orders replaces that. An effect that lands on its own
 * document shares one target write and one receipt write with the whole cohort,
 * since a favourability gain and a receipt path on a document no other order
 * touches cannot collide. Two orders on one document, and a targeted-ad array
 * that needs its own revision compare-and-set, keep the per-order path, which
 * knows how to retry them.
 */
export async function applyPoliticalMediaOrderEffects(
  db: Db,
  orderIds: readonly string[]
): Promise<number> {
  if (orderIds.length === 0) return 0;
  const orders = db.collection<PoliticalMediaMoveRecord>(MONEY_MOVE_COLLECTION);
  const records = await orders
    .find(
      {
        _id: { $in: orderIds.map(politicalMediaOrderKey) },
        kind: POLITICAL_MEDIA_ORDER_KIND,
        status: "applied",
      },
      { projection: { politicalMediaOrder: 1 } }
    )
    .toArray();
  const byKey = new Map(records.map((record) => [record._id, record.politicalMediaOrder]));
  let applied = 0;
  const receiptKeys: string[] = [];
  const ordersPerDocument = new Map<string, number>();
  const favourites: {
    orderId: string;
    effect: Extract<PoliticalMediaOrderEffect, { kind: "favorability" }>;
    order: PoliticalMediaOrderRecord;
  }[] = [];
  const deferred: { orderId: string; order: PoliticalMediaOrderRecord }[] = [];
  for (const orderId of orderIds) {
    const order = byKey.get(politicalMediaOrderKey(orderId));
    if (!order) continue;
    if (order.status !== "settled" || !order.settlementPlan) continue;
    if (order.effectApplied) {
      applied += 1;
      continue;
    }
    const rawEffect = order.identity.details.effect;
    const effect =
      rawEffect === undefined
        ? { kind: "none" as const }
        : parsePoliticalMediaOrderEffect(rawEffect);
    if (effect?.kind === "none") {
      receiptKeys.push(politicalMediaOrderKey(orderId));
      applied += 1;
      continue;
    }
    if (!effect) continue;
    if (effect.kind === "favorability" && Number.isFinite(effect.amount) && effect.amount > 0) {
      const documentKey = `${effect.targetCollection}\u0000${effect.targetDocumentId}`;
      ordersPerDocument.set(documentKey, (ordersPerDocument.get(documentKey) ?? 0) + 1);
      favourites.push({ orderId, effect, order });
      continue;
    }
    deferred.push({ orderId, order });
  }
  const shared = new Set(
    favourites
      .filter(
        (entry) =>
          (ordersPerDocument.get(
            `${entry.effect.targetCollection}\u0000${entry.effect.targetDocumentId}`
          ) ?? 0) > 1
      )
      .map((entry) => entry.orderId)
  );
  const byCollection = new Map<PoliticalMediaTargetCollection, typeof favourites>();
  for (const entry of favourites) {
    if (shared.has(entry.orderId)) {
      deferred.push({ orderId: entry.orderId, order: entry.order });
      continue;
    }
    const entries = byCollection.get(entry.effect.targetCollection) ?? [];
    entries.push(entry);
    byCollection.set(entry.effect.targetCollection, entries);
  }
  for (const [collection, entries] of byCollection) {
    const writes: AnyBulkWriteOperation<PoliticalMediaTargetDocument>[] = entries.map((entry) => {
      const fillRatio = politicalMediaFillRatio(
        entry.order.settlementPlan!.deliveredAnchor,
        entry.order.identity.requestedAnchor
      );
      const amount = entry.effect.amount * fillRatio;
      const receiptPath = `politicalMediaAppliedOrders.${entry.orderId}`;
      return {
        updateOne: {
          filter: {
            _id: persistedId(
              entry.effect.targetDocumentId,
              entry.effect.targetDocumentIdIsObjectId
            ),
            [receiptPath]: { $exists: false },
          },
          update: [
            {
              $set: {
                favorability: {
                  $min: [100, { $max: [0, { $add: [{ $ifNull: ["$favorability", 0] }, amount] }] }],
                },
                [receiptPath]: true,
              },
            },
          ],
        },
      };
    });
    const matched = await applyFavourabilityBulk(db, collection, writes);
    if (matched === writes.length) {
      for (const entry of entries) receiptKeys.push(politicalMediaOrderKey(entry.orderId));
      applied += entries.length;
      continue;
    }
    // A document that did not take its receipt may be gone, or may already have
    // applied an earlier pass. The per-order path tells the two apart and writes
    // the receipt for whichever it finds.
    for (const entry of entries)
      if (await applyPoliticalMediaOrderEffectToOrder(db, entry.orderId, entry.order)) applied += 1;
  }
  for (const { orderId, order } of deferred)
    if (await applyPoliticalMediaOrderEffectToOrder(db, orderId, order)) applied += 1;
  if (receiptKeys.length > 0) {
    await orders.bulkWrite(
      receiptKeys.map((key) => ({
        updateOne: {
          filter: {
            _id: key,
            kind: POLITICAL_MEDIA_ORDER_KIND,
            "politicalMediaOrder.status": "settled",
          },
          update: { $set: { "politicalMediaOrder.effectApplied": true } },
        },
      })),
      { ordered: false }
    );
  }
  return applied;
}

async function applyPoliticalMediaOrderEffectToOrder(
  db: Db,
  orderId: string,
  order: PoliticalMediaOrderRecord
): Promise<boolean> {
  const key = politicalMediaOrderKey(orderId);
  const orders = db.collection<PoliticalMediaMoveRecord>(MONEY_MOVE_COLLECTION);
  if (order.status !== "settled" || !order.settlementPlan) return false;
  if (order.effectApplied) return true;

  const rawEffect = order.identity.details.effect;
  const effect =
    rawEffect === undefined ? { kind: "none" as const } : parsePoliticalMediaOrderEffect(rawEffect);
  if (effect?.kind === "none") {
    await orders.updateOne(
      { _id: key, kind: POLITICAL_MEDIA_ORDER_KIND, "politicalMediaOrder.status": "settled" },
      { $set: { "politicalMediaOrder.effectApplied": true } }
    );
    return true;
  }
  if (!effect) return false;

  const targetId = persistedId(effect.targetDocumentId, effect.targetDocumentIdIsObjectId);
  const targets = db.collection<PoliticalMediaTargetDocument>(effect.targetCollection);
  const effectReceiptPath = `politicalMediaAppliedOrders.${orderId}`;
  const fillRatio = politicalMediaFillRatio(
    order.settlementPlan.deliveredAnchor,
    order.identity.requestedAnchor
  );
  if (effect.kind === "favorability") {
    if (!Number.isFinite(effect.amount) || !(effect.amount > 0)) return false;
    const amount = effect.amount * fillRatio;
    const update = await targets.updateOne(
      { _id: targetId, [effectReceiptPath]: { $exists: false } },
      [
        {
          $set: {
            favorability: {
              $min: [100, { $max: [0, { $add: [{ $ifNull: ["$favorability", 0] }, amount] }] }],
            },
            [effectReceiptPath]: true,
          },
        },
      ]
    );
    if (!update.matchedCount) {
      const alreadyApplied = await targets.findOne({ _id: targetId, [effectReceiptPath]: true });
      if (!alreadyApplied) return false;
    }
  } else if (effect.kind === "targeted_ad") {
    const ad = effect.ad;
    if (
      !ad ||
      !ad.stateId ||
      !ad.dimension ||
      !ad.bucket ||
      !Number.isFinite(ad.bonus) ||
      !(ad.bonus > 0) ||
      !Number.isSafeInteger(ad.lastPurchaseTurn)
    )
      return false;
    const deliveredIncrement = ad.bonus * fillRatio;
    if (!(deliveredIncrement > 0)) {
      const markedTarget = await targets.updateOne(
        { _id: targetId, [effectReceiptPath]: { $exists: false } },
        { $set: { [effectReceiptPath]: true } }
      );
      if (!markedTarget.matchedCount) {
        const alreadyApplied = await targets.findOne({ _id: targetId, [effectReceiptPath]: true });
        if (!alreadyApplied) return false;
      }
    } else {
      let applied = false;
      for (let attempt = 0; attempt < 5 && !applied; attempt++) {
        const alreadyApplied = await targets.findOne({ _id: targetId, [effectReceiptPath]: true });
        if (alreadyApplied) {
          applied = true;
          break;
        }
        const existing = await targets.findOne(
          { _id: targetId },
          { projection: { targetedAds: 1, targetedAdsRevision: 1 } }
        );
        if (!existing) return false;
        const ads = Array.isArray(existing.targetedAds) ? existing.targetedAds : [];
        const sameTarget = (previous: TargetedAd) =>
          previous.stateId === ad.stateId &&
          previous.dimension === ad.dimension &&
          previous.bucket === ad.bucket;
        const previousBonus = Math.max(
          0,
          ...ads.filter(sameTarget).map((previous) => adExposure(previous, ad.lastPurchaseTurn))
        );
        const nextBonus = Math.min(AD_BONUS_CAP, previousBonus + deliveredIncrement);
        const nextAds = ads.filter((previous) => !sameTarget(previous));
        if (nextBonus > 0) {
          nextAds.push({
            stateId: ad.stateId,
            dimension: ad.dimension,
            bucket: ad.bucket,
            bonus: nextBonus,
            lastPurchaseTurn: ad.lastPurchaseTurn,
          });
        }
        const revision =
          typeof existing.targetedAdsRevision === "number" ? existing.targetedAdsRevision : 0;
        const revisionFilter =
          existing.targetedAdsRevision === undefined
            ? { targetedAdsRevision: { $exists: false } }
            : { targetedAdsRevision: revision };
        const update = await targets.updateOne(
          { _id: targetId, [effectReceiptPath]: { $exists: false }, ...revisionFilter },
          {
            $set: {
              targetedAds: nextAds,
              targetedAdsRevision: revision + 1,
              [effectReceiptPath]: true,
            },
          }
        );
        applied = update.matchedCount > 0;
      }
      if (!applied) return false;
    }
  } else {
    return false;
  }

  const marked = await orders.updateOne(
    { _id: key, kind: POLITICAL_MEDIA_ORDER_KIND, "politicalMediaOrder.status": "settled" },
    { $set: { "politicalMediaOrder.effectApplied": true } }
  );
  return marked.matchedCount > 0 || Boolean(order.effectApplied);
}
