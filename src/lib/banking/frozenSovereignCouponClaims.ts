import type { SovereignCouponClaimRecord } from "@/lib/banking/sovereignCouponPrefetch";

import type { Bond } from "@/lib/db/types/bond";
import type { FundedSovereignCouponClaim } from "@/lib/db/types/budget";
import { bondAccruesCoupon } from "@/lib/constants/bonds";

import {
  freezeSovereignCouponClaim,
  groupSovereignCouponClaims,
  sovereignCouponPayeeGroup,
  type SovereignCouponBondSnapshot,
  type SovereignCouponCorporationQuote,
} from "@/lib/banking/rules/sovereignCoupons";

export interface FreezeDueSovereignCouponInput {
  budgetId: string;
  bonds: readonly Bond[];
  turn: number;
  anchorRate: number;
  forexEnabled: boolean;
  corporateQuotes: ReadonlyMap<string, SovereignCouponCorporationQuote>;
  frozenThrough?: Record<string, number>;
  knownClaims: ReadonlyMap<string, FundedSovereignCouponClaim>;
  /**
   * `sovereignCouponGroupedAccrualEnabled`: fold this turn's per-bond claims
   * into one claim per currency and payee group
   * (`groupSovereignCouponClaims`). Absent, one claim per bond.
   */
  grouped?: boolean;
}

/** One budget's frozen claims for this turn, and the frozen-through marks they set. */
export interface FrozenSovereignCouponClaimSet {
  records: SovereignCouponClaimRecord[];
  /** `$max` update for `sovereignCouponFrozenThrough`, one entry per bond frozen. */
  marks: Record<string, number>;
  /** Grouped only: the per-bond claims each grouped record folds, by record id. */
  parts: Map<string, FundedSovereignCouponClaim[]>;
}

export function freezeDueSovereignCouponClaimSet(
  input: FreezeDueSovereignCouponInput
): FrozenSovereignCouponClaimSet {
  const records: SovereignCouponClaimRecord[] = [];
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
    if (input.knownClaims.has(claimId)) continue;
    if ((input.frozenThrough?.[`b${bondId}`] ?? -1) >= input.turn) continue;
    const snapshot: SovereignCouponBondSnapshot = {
      id: bondId,
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
    records.push({
      _id: claim.id,
      budgetId: input.budgetId,
      order: records.length,
      claim,
      createdAt: new Date(),
    });
  }
  const marks = Object.fromEntries(
    records.map((row) => [`sovereignCouponFrozenThrough.b${row.claim.bondId}`, row.claim.dueTurn])
  );
  if (!input.grouped) return { records, marks, parts: new Map() };
  return {
    ...groupedRecords(
      input.budgetId,
      records.map((row) => row.claim)
    ),
    marks,
  };
}

export function groupedRecords(
  budgetId: string,
  claims: readonly FundedSovereignCouponClaim[],
  idSuffix = ""
): Pick<FrozenSovereignCouponClaimSet, "records" | "parts"> {
  const parts = new Map<string, FundedSovereignCouponClaim[]>();
  const records = groupSovereignCouponClaims(budgetId, claims, idSuffix).map((row, order) => {
    // Only the legs this group carries, so regrouping a part rebuilds exactly
    // its share of the claim.
    const bondIds = new Set(row.bondIds);
    parts.set(
      row.claim.id,
      claims.flatMap((claim) => {
        if (
          !bondIds.has(claim.bondId) ||
          claim.dueTurn !== row.claim.dueTurn ||
          claim.currencyCode !== row.claim.currencyCode ||
          claim.anchorRate !== row.claim.anchorRate
        )
          return [];
        const holders = claim.holders.filter(
          (holder) => sovereignCouponPayeeGroup(holder.kind) === row.group
        );
        return [
          {
            ...claim,
            holders,
            amountLocal: holders.reduce((sum, holder) => sum + holder.amountLocal, 0),
          },
        ];
      })
    );
    return {
      _id: row.claim.id,
      budgetId,
      order,
      claim: row.claim,
      createdAt: new Date(),
      bondIds: row.bondIds,
    };
  });
  return { records, parts };
}
