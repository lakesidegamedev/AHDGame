/**
 * What a funded sovereign maturity retires, and the two journal projections
 * that record it. Shared by the per-bond settlement and the country wave so the
 * batched path cannot drift from the reference path: same debt figures, same
 * bond guard, same fields set on the retired bond.
 */
import type { Bond } from "@/lib/db/types/bond";
import type { TransitionProjection } from "@/lib/banking/rules/boundary";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import { sovereignBondOutstanding } from "@/lib/bonds/sovereignPrincipal";

type MaturityClaim = NonNullable<Bond["sovereignMaturityClaim"]>;

export interface SovereignMaturityRetirementFigures {
  /** Principal still outstanding on the bond after any novated pool float left it. */
  remainingIssued: number;
  /** Pool float still on the bond after novation, and the guard for its own retirement. */
  remainingPublicFloat: number;
  /** Face retired from the sovereign debt stock. */
  maturedFace: number;
  /** Annual coupon cost the retirement takes out of debt service. */
  annualCouponCost: number;
}

/**
 * Debt figures a maturity retires. A public-float novation moved part of the
 * bond to a replacement before payout, so the retired face is measured on the
 * remaining source bond, not the due-turn snapshot.
 */
export function sovereignMaturityRetirementFigures(
  bond: Bond,
  quote: MaturityClaim
): SovereignMaturityRetirementFigures {
  const novatedUnits =
    quote.publicFloatDisposition?.mode === "novation"
      ? quote.publicFloatDisposition.acceptedUnits
      : 0;
  const originalTotalIssued =
    quote.publicFloatDisposition?.mode === "novation"
      ? quote.publicFloatDisposition.sourceTotalIssued
      : bond.totalIssued;
  const originalCouponRate =
    quote.publicFloatDisposition?.mode === "novation"
      ? quote.publicFloatDisposition.sourceCouponRate
      : bond.couponRate;
  const originalHaircut =
    quote.publicFloatDisposition?.mode === "novation"
      ? (quote.publicFloatDisposition.sourceRestructureHaircutPercent ?? null)
      : (bond.restructureHaircutPercent ?? null);
  const remainingIssued = Math.max(0, originalTotalIssued - novatedUnits * BOND_UNIT_FACE_VALUE);
  const remainingPublicFloat = Math.max(0, quote.sourcePublicFloat - novatedUnits);
  return {
    remainingIssued,
    remainingPublicFloat,
    maturedFace: sovereignBondOutstanding({
      issuerType: "sovereign",
      matured: false,
      defaulted: false,
      totalIssued: remainingIssued,
      restructureHaircutPercent: originalHaircut,
    }),
    annualCouponCost: (originalCouponRate / 100) * remainingIssued,
  };
}

/**
 * The `$inc` that retires a maturity's debt stock on the national budget. A
 * wave sums these across its bonds into one projection; a single bond applies
 * its own. Delta only, so concurrent issuance on the same budget survives.
 */
export function sovereignMaturityBudgetRetirementInc(
  figures: SovereignMaturityRetirementFigures
): Record<string, number> {
  return {
    "debt.principal": -figures.maturedFace,
    "spending.debtInterest": -figures.annualCouponCost,
    "spending.total": -figures.annualCouponCost,
    surplus: figures.annualCouponCost,
  };
}

/**
 * The retire projection for one bond: guards the frozen due-turn identity and
 * writes the fields every settled maturity shares. It is the last projection of
 * a payout, so a failed cash or holder leg leaves the bond active.
 */
export function sovereignMaturityBondRetireProjection(input: {
  bond: Bond;
  quote: MaturityClaim;
  claimId: string;
  dueTurn: number;
  sourceCountryId: string;
  figures: SovereignMaturityRetirementFigures;
  turn: number;
  now: Date;
  /** Extra identity fields a novated source bond must still match. */
  frozenSourceIdentity?: Record<string, unknown>;
}): TransitionProjection {
  const { bond, quote, figures } = input;
  return {
    collection: "bonds",
    filter: {
      _id: bond._id,
      issuerType: "sovereign",
      countryId: input.sourceCountryId,
      ...(input.frozenSourceIdentity ?? {}),
      maturityTurn: input.dueTurn,
      matured: false,
      defaulted: false,
      "sovereignMaturityClaim.id": input.claimId,
      "sovereignMaturityClaim.escrowLocal": 0,
      holders: quote.sourceHolders,
      publicFloat: figures.remainingPublicFloat,
      totalIssued: figures.remainingIssued,
      ...(quote.sourceCentralBankHoldings === undefined
        ? { centralBankHoldings: { $exists: false } }
        : { centralBankHoldings: quote.sourceCentralBankHoldings }),
    },
    update: {
      $set: {
        "sovereignMaturityClaim.escrowLocal": 0,
        "sovereignMaturityClaim.paid": true,
        matured: true,
        redeemedAtTurn: input.turn,
        marketPrice: 1,
        publicFloat: 0,
        holders: [],
        centralBankHoldings: 0,
        updatedAt: input.now,
      },
    },
    note: "Retire sovereign bond after every funded holder leg lands",
  };
}
