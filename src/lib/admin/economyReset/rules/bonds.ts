/**
 * Sovereign debt rules for the economy-only reset.
 *
 * Debt and instruments stay with the treasuries. Every private holder
 * (character, imperial, corporation, fund, bank, NPP) is dropped and its units
 * join the public float; the central bank's holdings and any maturity escrow
 * are treasury money and are untouched. Coupons frozen for the dropped holders
 * are cancelled, so the treasury keeps that money and nothing is minted.
 */
import type { CouponClaimPatch, SovereignBondRehome } from "../types";

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
  /** Unpaid maturity claim legs that would credit a private holder. */
  privateMaturityLegs: number;
}

/** Kinds of maturity payout legs that credit a private holder. */
export const PRIVATE_HOLDER_COLLECTIONS: readonly string[] = Object.freeze([
  "characters",
  "imperialCharacters",
  "corporations",
  "indexFunds",
  "npps",
]);

export function rehomeSovereignBond(bond: SovereignBondSource): {
  rehome: SovereignBondRehome | null;
  blockers: string[];
} {
  const blockers: string[] = [];
  if (bond.holders.some((holder) => holder.bankTreasuryTradeId))
    blockers.push(`in-flight-bank-treasury-trade:${bond.id}`);
  if (bond.holders.some((holder) => holder.saleIntentId && holder.units > 0))
    blockers.push(`in-flight-bond-sale:${bond.id}`);
  if (bond.privateMaturityLegs > 0) blockers.push(`open-private-maturity-claim:${bond.id}`);
  if (bond.holders.length === 0) return { rehome: null, blockers };
  const unitsMoved = bond.holders.reduce(
    (sum, holder) => sum + (Number.isFinite(holder.units) && holder.units > 0 ? holder.units : 0),
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
      publicFloatAfter: publicFloatBefore + unitsMoved,
      holdersRemoved: bond.holders.length,
      unitsMoved,
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
