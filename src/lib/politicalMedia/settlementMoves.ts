import { ObjectId } from "mongodb";
import { MONEY_MOVE_COLLECTION, type MoneyMove, type MoneyMoveLeg } from "@/lib/banking/moneyMove";

export const POLITICAL_MEDIA_ORDER_KIND = "political-media-order";

export const POLITICAL_MEDIA_ESCROW_CURRENCY = "AHD";

export const POLITICAL_MEDIA_ESCROW_RATE = 1;

export type PoliticalMediaOrderSource = "advertise" | "targeted_ad" | "campaign_maintenance";

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

export interface PoliticalMediaOrderRecord {
  status: "funding" | "open" | "settling" | "settled" | "rejected";
  escrowBalanceAnchor: number;
  identity: PoliticalMediaOrderIdentity;
  settlementPlan?: PoliticalMediaSettlementPlan;
  effectApplied?: boolean;
}

export interface PoliticalMediaOrderForClearing {
  orderId: string;
  identity: PoliticalMediaOrderIdentity;
  settlementPlan?: PoliticalMediaSettlementPlan;
  status: PoliticalMediaOrderRecord["status"];
  effectApplied?: boolean;
}

export function persistedId(value: string, isObjectId: boolean): ObjectId | string {
  return isObjectId ? new ObjectId(value) : value;
}

export function politicalMediaOrderKey(orderId: string): string {
  return `political-media-order:${orderId}`;
}

export /** Stable key for one order's whole settlement, instead of a move per seller. */
function politicalMediaSettlementKey(orderId: string, plannedTurn: number): string {
  return `political-media-settlement:${orderId}:${plannedTurn}`;
}

export /**
 * How far the payer refund may sit from the plan's unfilled anchor before it is
 * worth a leg. Funding credited the exact requested anchor, so the escrow is
 * spent whole and a residue below this stays in escrow instead of being paid out
 * as dust.
 */
const SETTLEMENT_DUST_ANCHOR = 1e-9;

export interface BuiltSettlementMove {
  move: MoneyMove;
  /** Leg index carrying each plan seller's credit, in plan order, or -1 if it has no target. */
  sellerLegIndex: number[];
  /** True when a credit target was gone, so the move stops before it and the order stays open. */
  truncated: boolean;
}

export /** A credit target, as the preflight remembers which ones were not there. */
function creditTargetKey(collection: string, id: unknown): string {
  return `${collection}\u0000${String(id)}`;
}

export /**
 * One journaled move for a whole order: escrow leaves once, each payee is credited once.
 *
 * Credits are declared in the order the plan pays them: plan sellers, then the
 * no-outlet fallback, then the unfilled refund. A credit whose target document
 * is gone stops the list there, so the move spends exactly what the plan would
 * have spent before the same refusal, and a short-stopped order keeps its
 * settling status instead of closing over a hole.
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
  const creditAnchor = credits.reduce(
    (sum, leg) => sum + leg.amount / (leg.valuation?.localPerAnchor ?? 1),
    0
  );
  // Converting each credit back to anchor can overshoot the funded escrow by
  // floating point noise (2e-12 on a 12,000 order). The escrow debit is guarded
  // by a sufficiency filter, so that noise refused the settlement for good.
  // Spend at most the escrow; the difference is far inside the money move's
  // net tolerance.
  const debitAmount =
    creditAnchor > identity.requestedAnchor &&
    creditAnchor - identity.requestedAnchor <=
      SETTLEMENT_DUST_ANCHOR * Math.max(1, identity.requestedAnchor)
      ? identity.requestedAnchor
      : creditAnchor;

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

export /** The receipt one seller allocation leaves on the corporation it is paid to. */
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
