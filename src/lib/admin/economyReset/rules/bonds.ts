/**
 * Sovereign debt rules for the economy-only reset.
 *
 * Debt and instruments stay with the treasuries. Every private holder
 * (character, imperial, corporation, fund, bank, NPP) is dropped and its units
 * join the public float; the central bank's holdings and any maturity escrow
 * are treasury money and are untouched. Coupons frozen for the dropped holders
 * are cancelled, so the treasury keeps that money and nothing is minted.
 */
import type { CouponClaimPatch, MaturityClaimPatch, SovereignBondRehome } from "../types";

export interface SovereignBondSource {
  id: string;
  countryId: string;
  currency: string;
  totalIssued: number;
  publicFloat: number;
  holders: {
    units: number;
    bankTreasuryTradeId?: string;
    saleIntentId?: string;
  }[];
  /** The bond's unpaid frozen maturity quote, when it has one. */
  maturityClaim?: MaturityClaimSource | null;
}

export interface MaturityClaimLeg {
  collection: string;
  amount: number;
  currencyCode: string;
  localPerAnchor: number;
}

export interface MaturityClaimSource {
  currency: string;
  treasuryLocalPerAnchor: number;
  amountLocal: number;
  escrowLocal: number;
  legs: MaturityClaimLeg[];
  /** A payout journal for this quote has started; it settles through the money move rules. */
  payoutInFlight: boolean;
}

/** Kinds of maturity payout legs that credit a private holder. */
export const PRIVATE_HOLDER_COLLECTIONS: readonly string[] = Object.freeze([
  "characters",
  "imperialCharacters",
  "corporations",
  "indexFunds",
  "npps",
]);

/** Claim-currency value of one frozen payout leg. Anchor legs convert at the quote's rate. */
export function maturityLegLocal(leg: MaturityClaimLeg, claim: MaturityClaimSource): number {
  if (leg.currencyCode === claim.currency) return leg.amount;
  const perAnchor = leg.localPerAnchor > 0 ? leg.localPerAnchor : 1;
  return (leg.amount / perAnchor) * claim.treasuryLocalPerAnchor;
}

export function isPrivateMaturityLeg(leg: { collection: string }): boolean {
  return PRIVATE_HOLDER_COLLECTIONS.includes(leg.collection);
}

/**
 * Cancel the private holders' share of an unpaid maturity quote, as for coupon
 * claims: their legs are removed and the quote shrinks by their value, so the
 * treasury keeps that money. Escrow already funded stays in the bond's escrow
 * and still pays the kept legs; nothing is paid out here. Returns null when the
 * quote owes no private holder or its payout journal is already running.
 */
export function trimMaturityClaim(
  bondId: string,
  claim: MaturityClaimSource
): MaturityClaimPatch | null {
  if (claim.payoutInFlight) return null;
  const removed = claim.legs.filter(isPrivateMaturityLeg);
  if (removed.length === 0) return null;
  const removedLocal = removed.reduce((sum, leg) => sum + maturityLegLocal(leg, claim), 0);
  const amountLocalAfter = Math.max(0, claim.amountLocal - removedLocal);
  return {
    bondId,
    currency: claim.currency,
    legsRemoved: removed.length,
    amountLocalBefore: claim.amountLocal,
    amountLocalAfter,
    privateAmountLocal: removedLocal,
    escrowLocal: claim.escrowLocal,
    /** Escrow beyond the shrunken quote stays in escrow for the treasury. */
    escrowSurplusLocal: Math.max(0, claim.escrowLocal - amountLocalAfter),
  };
}

export function rehomeSovereignBond(bond: SovereignBondSource): {
  rehome: SovereignBondRehome | null;
  blockers: string[];
} {
  const blockers: string[] = [];
  if (bond.holders.some((holder) => holder.bankTreasuryTradeId))
    blockers.push(`in-flight-bank-treasury-trade:${bond.id}`);
  if (bond.holders.some((holder) => holder.saleIntentId && holder.units > 0))
    blockers.push(`in-flight-bond-sale:${bond.id}`);
  if (bond.holders.length === 0) return { rehome: null, blockers };
  // Units of a bond with a frozen maturity quote are already redeemed by that
  // quote; moving them to the float would hand the pool units it is not paid for.
  const units = bond.maturityClaim
    ? 0
    : bond.holders.reduce(
        (sum, holder) =>
          sum + (Number.isFinite(holder.units) && holder.units > 0 ? holder.units : 0),
        0
      );
  const publicFloatBefore = Number.isFinite(bond.publicFloat) ? bond.publicFloat : 0;
  return {
    rehome: {
      id: bond.id,
      countryId: bond.countryId,
      currency: bond.currency,
      totalIssued: bond.totalIssued,
      publicFloatBefore,
      publicFloatAfter: publicFloatBefore + units,
      holdersRemoved: bond.holders.length,
      unitsMoved: units,
    },
    blockers,
  };
}

export interface CouponClaimHolder {
  kind: string;
  amountLocal: number;
}

export interface CouponClaimSource {
  id: string;
  currency: string;
  amountLocal: number;
  holders: CouponClaimHolder[];
}

/** Holders a frozen coupon may still pay after the reset. */
export function keptCouponHolders<T extends CouponClaimHolder>(holders: T[]): T[] {
  return holders.filter((holder) => holder.kind === "publicFloat");
}

/**
 * Cancel the private holders' share of an open coupon claim. Returns null when
 * nothing changes (the claim only owes the public float).
 */
export function trimCouponClaim(claim: CouponClaimSource): CouponClaimPatch | null {
  const kept = keptCouponHolders(claim.holders);
  if (kept.length === claim.holders.length) return null;
  const amountLocalAfter = kept.reduce((sum, holder) => sum + holder.amountLocal, 0);
  return {
    id: claim.id,
    action: kept.length === 0 ? "delete" : "trim",
    amountLocalBefore: claim.amountLocal,
    amountLocalAfter,
    currency: claim.currency,
  };
}

/** Corporate issues die with their issuers. Missing issuerType is a legacy corporate bond. */
export function isSovereignBond(bond: { issuerType?: string | null }): boolean {
  return bond.issuerType === "sovereign";
}
