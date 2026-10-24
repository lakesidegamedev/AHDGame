/**
 * Stuck bank money moves on a live world.
 *
 * A partial move has applied some legs and is waiting on others. The reset
 * keeps the bank money move journal (it is the replay witness for kept
 * accounts), so each partial move is either voided or blocks the reset:
 *
 * - Voided when every leg it still owes would land on money the reset removes
 *   anyway (a wiped collection or a private wallet) or on a private holder
 *   document that no longer exists. Its source legs applied long ago, so
 *   voiding changes no balance; the plan records what it still owed.
 * - A blocker when any leg it still owes is a kept account (a treasury, the
 *   central bank, the bond pool, a party, union, organization, pension or a
 *   campaign wallet), or when it is a sovereign payout whose bond projections
 *   must still run. The reason says what the operator has to do first.
 */
import type { VoidedMoneyMove } from "../types";

export interface PendingMoneyMoveLeg {
  collection: string | null;
  targetId: string | null;
  path: string | null;
  amount: number;
  currency: string;
  targetExists: boolean;
}

export interface PartialMoneyMoveSource {
  id: string;
  kind: string;
  turn: number | null;
  pendingLegs: PendingMoneyMoveLeg[];
}

/** Holder documents whose private money the reset clears, and which may be deleted in play. */
const PRIVATE_HOLDER_DOCUMENTS = new Set([
  "characters",
  "imperialCharacters",
  "npps",
  "corporations",
  "indexFunds",
  // A finished campaign's document is deleted; nothing can receive its refund.
  "campaigns",
]);

/** Paths on kept documents that hold private money the reset clears. */
const PRIVATE_PATHS: Record<string, readonly string[]> = {
  characters: [
    "currencyBalances.personal",
    "currencyBalances.savings",
    "cashOnHand",
    "savingsOnHand",
  ],
  imperialCharacters: ["currencyBalances.personal", "cashOnHand"],
  npps: ["nppInvestmentCashAnchor", "currencyBalances"],
};

/** Payouts whose bond projections only the bond turn can apply. */
const SETTLEMENT_KINDS = new Set(["sovereign_maturity_payout"]);

function isPrivatePath(collection: string, path: string | null): boolean {
  const prefixes = PRIVATE_PATHS[collection];
  return (
    !!prefixes &&
    !!path &&
    prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`))
  );
}

export function classifyPartialMoneyMove(
  move: PartialMoneyMoveSource,
  wipedCollections: ReadonlySet<string>
): { voided: VoidedMoneyMove | null; blocker: string | null } {
  if (SETTLEMENT_KINDS.has(move.kind) || move.id.startsWith("sovereign-coupon:"))
    return {
      voided: null,
      blocker: `sovereign-payout-in-flight:${move.id}: a sovereign payout must finish through the bond turn; repair any leg without a target (heal AHD-sovereign-maturity-stranded-payout), run one turn, then re-run the census`,
    };
  const kept: string[] = [];
  const voidedLegs: VoidedMoneyMove["pendingLegs"] = [];
  for (const leg of move.pendingLegs) {
    const target = `${leg.collection ?? "untargeted"}:${leg.targetId ?? "?"}`;
    if (!leg.collection) {
      kept.push(`${target} has no recorded target`);
      continue;
    }
    const wiped = wipedCollections.has(leg.collection);
    if (wiped || (leg.targetExists && isPrivatePath(leg.collection, leg.path))) {
      voidedLegs.push({
        collection: leg.collection,
        targetId: leg.targetId ?? "",
        reason: "private",
        amount: leg.amount,
        currency: leg.currency,
      });
      continue;
    }
    if (!leg.targetExists && PRIVATE_HOLDER_DOCUMENTS.has(leg.collection)) {
      voidedLegs.push({
        collection: leg.collection,
        targetId: leg.targetId ?? "",
        reason: "missing",
        amount: leg.amount,
        currency: leg.currency,
      });
      continue;
    }
    kept.push(
      `${target}${leg.path ? `.${leg.path}` : ""}${leg.targetExists ? "" : " (target missing)"}`
    );
  }
  if (kept.length > 0)
    return {
      voided: null,
      blocker: `kept-account-money-move:${move.id}: still owes kept accounts ${kept.join(", ")}; run one turn or reconcile this move, then re-run the census`,
    };
  return {
    voided: { id: move.id, kind: move.kind, turn: move.turn, pendingLegs: voidedLegs },
    blocker: null,
  };
}
