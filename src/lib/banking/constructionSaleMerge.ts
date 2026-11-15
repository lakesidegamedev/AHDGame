import { ObjectId, type Db } from "mongodb";
import type { CorporateSector } from "@/lib/db/types/corporation";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import {
  mergeSectorOperatingFields,
  mergeSectorPlantFields,
} from "@/lib/corporations/sectorTransferCapex";
import { sectorMergeStrategyRefusal } from "@/lib/corporations/sectorMergeStrategy";
import { constructionBorrowerTransferRefusal } from "./rules/constructionBorrowerTransfer";
import { hasProtectedConstructionClaim } from "./rules/constructionProperty";
import { mergeSurvivorConstructionFilter } from "./constructionBorrowerTransfer";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";

/**
 * Why a pledged site cannot fold into the buyer's existing site in its market,
 * or null when it can. The sold row's own loan is paid out of the price, so
 * only the survivor matters: it may carry its own stable construction loan,
 * which stays with the buyer, but not an ownership change in flight.
 */
export function securedSaleMergeRefusal(
  survivor: Pick<
    CorporateSector,
    "corporationId" | "constructionFinancing" | "constructionPropertyTransition"
  >
): string | null {
  if (survivor.constructionPropertyTransition)
    return "Your site in that market is in the middle of another ownership change. Try again shortly.";
  if (!hasProtectedConstructionClaim(survivor)) return null;
  const refusal = constructionBorrowerTransferRefusal({
    claim: survivor.constructionFinancing!,
    loan: null,
    sectorId: "",
    fromId: survivor.corporationId.toHexString(),
    toId: survivor.corporationId.toHexString(),
    toCurrency: undefined,
  });
  return refusal ? `Your site in that market cannot take this one in yet. ${refusal}` : null;
}

/**
 * Fold a sold pledged site into the buyer's existing site and delete it. The
 * buyer has already paid, the lender is settled and the sold row's loan claim
 * is released, so this only moves operating state. Each step is safe to repeat:
 * the survivor records which sale it absorbed, so a crash between the fold and
 * the delete resumes without folding twice.
 */
export async function foldSoldSiteIntoSurvivor(
  db: Db,
  input: { donorId: ObjectId; survivorId: ObjectId; buyerId: ObjectId; saleKey: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sectors = corporateSectorsCollection(db);
  const { donorId, survivorId, buyerId, saleKey } = input;
  const plants = marketAtLeast(await getMarketSystemModeForDb(db), "plants");
  // bounded-cas-retry(maxAttempts=5): Retry only when a turn rewrote the survivor between the read and the guarded fold.
  for (let attempt = 0; attempt < 5; attempt++) {
    const donor = await sectors.findOne({ _id: donorId });
    if (!donor) break;
    const survivor = await sectors.findOne({ _id: survivorId });
    if (!survivor || !survivor.corporationId.equals(buyerId))
      return { ok: false, error: "The buyer's site changed before the purchase was merged" };
    if (survivor.securedSaleFold !== saleKey) {
      // The sale path refuses a strategy mismatch before any money moves, so
      // this only fires if a strategy changed in between. Fold nothing then.
      const refusal =
        sectorMergeStrategyRefusal(donor, survivor) ?? securedSaleMergeRefusal(survivor);
      if (refusal) return { ok: false, error: refusal };
      // The released claim and loan are gone for the buyer's purposes: strip
      // the references so queued capacity folds in as plain paid construction.
      const incoming = {
        ...donor,
        buildQueue: (donor.buildQueue ?? []).map(
          ({ constructionClaimId: _claim, constructionLoanId: _loan, ...order }) => order
        ),
      };
      const applied = await sectors.updateOne(
        {
          _id: survivor._id,
          corporationId: buyerId,
          securedSaleFold: { $ne: saleKey },
          revenue: survivor.revenue,
          workers: survivor.workers,
          ...mergeSurvivorConstructionFilter(survivor),
        },
        {
          $set: {
            ...mergeSectorOperatingFields(survivor, donor),
            ...(plants ? mergeSectorPlantFields(survivor, incoming) : {}),
            securedSaleFold: saleKey,
            updatedAt: new Date(),
          },
        }
      );
      // A turn rewrote the survivor between the read and the write: read again.
      if (applied.matchedCount !== 1) continue;
    }
    const deleted = await sectors.deleteOne({
      _id: donorId,
      "constructionPropertyTransition.key": { $exists: true },
      "constructionFinancing.sale.key": saleKey,
      "constructionFinancing.sale.completed": true,
    });
    if (deleted.deletedCount !== 1)
      return { ok: false, error: "The sold site could not be removed after merging" };
    break;
  }
  await sectors.updateOne(
    { _id: survivorId, securedSaleFold: saleKey },
    { $unset: { securedSaleFold: "" } }
  );
  if (await sectors.findOne({ _id: donorId }, { projection: { _id: 1 } }))
    return { ok: false, error: "The purchase is still being merged" };
  return { ok: true };
}
