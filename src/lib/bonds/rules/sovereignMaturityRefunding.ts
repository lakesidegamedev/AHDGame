/**
 * Sovereign maturity refunding. When a Treasury's spendable cash cannot pay a
 * matured bond, it refinances the shortfall the way a real treasury does: it
 * sells a new bond to the market and pays the maturing holders with the
 * proceeds. Plain data in, plain data out.
 *
 * Debt ceiling: a refunding replaces maturing debt, it does not add to it. The
 * refunded face is capped at the face the maturing claim retires, and the
 * retirement lands in the same pass as the payout, so net principal after the
 * maturity is never higher than before it. That is why a refunding is not
 * gated on `debt.ceiling` headroom: the ceiling limits new net borrowing, and
 * refusing to refinance would leave the holders unpaid (a default), which is
 * not an acceptable outcome.
 */
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";

export type SovereignRefundingRefusal =
  "invalid_input" | "no_shortfall" | "cap_exhausted" | "no_market_capacity";

export interface SovereignRefundingInput {
  /** Cash the claim still needs beyond what the Treasury holds, local currency. */
  shortfallLocal: number;
  /** Face the maturing claim retires: the ceiling on everything ever refunded for it. */
  retiringFaceLocal: number;
  /** Face already refunded for this claim on earlier attempts. */
  alreadyRefundedLocal: number;
  /** Units the currency's bond pool will underwrite now (planSovereignUnderwriting). */
  marketCapacityUnits: number;
}

export type SovereignRefundingPlan =
  | { units: number; faceLocal: number; refusal?: undefined }
  | { units: 0; faceLocal: 0; refusal: SovereignRefundingRefusal };

/**
 * Whole units that cover the shortfall, rounded up so the claim is fully
 * funded, then capped by the claim's unrefunded face and by what the market
 * will actually buy this turn. A partial fill is still taken: it shrinks the
 * gap, and the next turn refunds the rest under the same cap.
 */
export function planSovereignMaturityRefunding(
  input: SovereignRefundingInput
): SovereignRefundingPlan {
  const { shortfallLocal, retiringFaceLocal, alreadyRefundedLocal, marketCapacityUnits } = input;
  if (
    !Number.isFinite(shortfallLocal) ||
    !Number.isFinite(retiringFaceLocal) ||
    !Number.isFinite(alreadyRefundedLocal) ||
    !Number.isFinite(marketCapacityUnits) ||
    retiringFaceLocal < 0 ||
    alreadyRefundedLocal < 0
  )
    return refused("invalid_input");
  if (shortfallLocal <= 0) return refused("no_shortfall");
  const neededUnits = Math.ceil(shortfallLocal / BOND_UNIT_FACE_VALUE);
  const capUnits = Math.floor((retiringFaceLocal - alreadyRefundedLocal) / BOND_UNIT_FACE_VALUE);
  if (capUnits <= 0) return refused("cap_exhausted");
  const units = Math.min(neededUnits, capUnits, Math.max(0, Math.floor(marketCapacityUnits)));
  if (units <= 0) return refused("no_market_capacity");
  return { units, faceLocal: units * BOND_UNIT_FACE_VALUE };
}

/** Deterministic journal key for one refunding attempt on one claim. */
export function sovereignRefundingKey(
  claimId: string,
  scope: "bank" | "holders",
  turn: number
): string {
  return `sovereign-refunding:${claimId}:${scope}:${turn}`;
}

function refused(refusal: SovereignRefundingRefusal): SovereignRefundingPlan {
  return { units: 0, faceLocal: 0, refusal };
}
