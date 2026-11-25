import type { Db, ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

/** IMF bailout loans owed to a lender corporation (anchor ₳ principal outstanding). */
export type ImfFacilityReceivableRow = {
  borrowerCorporationId: string;
  borrowerName: string;
  sequentialId?: number;
  principalOutstanding: number;
  annualRatePercent: number;
  amortizationTurnsRemaining: number;
  /** Snapshot on facility; used for payment preview (same cap as turn processing). */
  incomeCaptureFraction?: number;
  logoUrl: string | null;
  brandColor: string | null;
};

/** Carrying value is the recorded anchor principal, independent of borrower currency. */
export async function findImfFacilityReceivablesForLender(
  db: Db,
  lenderCorporationId: ObjectId
): Promise<{ receivables: ImfFacilityReceivableRow[]; totalPrincipal: number }> {
  const rows = await corporationsCollection(db)
    .find({
      imfBailoutActive: true,
      imfBailoutImfCorporationId: lenderCorporationId,
    })
    .project<
      Pick<
        Corporation,
        | "_id"
        | "name"
        | "sequentialId"
        | "imfFacilityPrincipalOutstanding"
        | "imfFacilityAnnualRate"
        | "imfFacilityAmortizationTurnsRemaining"
        | "imfFacilityIncomeCaptureFraction"
        | "logoUrl"
        | "brandColor"
        | "countryId"
        | "liquidCurrencyCode"
      >
    >({
      _id: 1,
      name: 1,
      sequentialId: 1,
      imfFacilityPrincipalOutstanding: 1,
      imfFacilityAnnualRate: 1,
      imfFacilityAmortizationTurnsRemaining: 1,
      imfFacilityIncomeCaptureFraction: 1,
      logoUrl: 1,
      brandColor: 1,
      countryId: 1,
      liquidCurrencyCode: 1,
    })
    .toArray();

  const receivables: ImfFacilityReceivableRow[] = rows.map((c) => {
    const principalAnchor = Math.max(0, c.imfFacilityPrincipalOutstanding ?? 0);
    return {
      borrowerCorporationId: c._id.toString(),
      borrowerName: c.name,
      sequentialId: c.sequentialId,
      principalOutstanding: principalAnchor,
      annualRatePercent: c.imfFacilityAnnualRate ?? 0,
      amortizationTurnsRemaining: c.imfFacilityAmortizationTurnsRemaining ?? 0,
      incomeCaptureFraction: c.imfFacilityIncomeCaptureFraction,
      logoUrl: c.logoUrl ?? null,
      brandColor: c.brandColor ?? null,
    };
  });

  const totalPrincipal = receivables.reduce((s, r) => s + r.principalOutstanding, 0);
  return { receivables, totalPrincipal };
}
