import type { Db } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import {
  hasProtectedConstructionClaim,
  hasProtectedConstructionProperty,
  unclaimedConstructionFilter,
} from "@/lib/banking/rules/constructionProperty";
import type { ConstructionBorrowerTransferPlan } from "@/lib/banking/constructionBorrowerTransfer";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
export {
  hasProtectedConstructionClaim,
  hasProtectedConstructionProperty,
  hasProtectedConstructionPropertyIn,
  unprotectedConstructionPropertyFilter,
} from "@/lib/banking/rules/constructionProperty";

/**
 * Claim an already-loaded property row before a multi-write disposition.
 * `claimFilter` replaces the default "no secured claim" match for a financed
 * site whose loan a borrower transfer has already locked.
 */
export async function acquireConstructionPropertyTransition(
  db: Db,
  sector: Pick<
    CorporateSector,
    "_id" | "corporationId" | "constructionFinancing" | "constructionPropertyTransition"
  >,
  key: string,
  kind: string,
  resumeSameKind = false,
  allowSameKeyResume = false,
  claimFilter?: Record<string, unknown>
): Promise<boolean> {
  const marker = sector.constructionPropertyTransition;
  if (
    (claimFilter ? !!marker : hasProtectedConstructionProperty(sector)) &&
    !(allowSameKeyResume && marker?.key === key) &&
    !(resumeSameKind && marker?.kind === kind)
  )
    return false;

  const result = await corporateSectorsCollection(db).updateOne(
    {
      _id: sector._id,
      corporationId: sector.corporationId,
      $and: [
        {
          $or: [
            { constructionPropertyTransition: { $exists: false } },
            ...(allowSameKeyResume ? [{ "constructionPropertyTransition.key": key }] : []),
            ...(resumeSameKind ? [{ "constructionPropertyTransition.kind": kind }] : []),
          ],
        },
        claimFilter ?? unclaimedConstructionFilter(),
      ],
    },
    { $set: { constructionPropertyTransition: { key, kind } } }
  );
  return result.matchedCount === 1;
}

export async function reserveSectorsForRestore(
  db: Db,
  sectors: Array<
    Pick<
      CorporateSector,
      "_id" | "corporationId" | "constructionFinancing" | "constructionPropertyTransition"
    >
  >
): Promise<boolean> {
  if (
    sectors.some(
      (sector) =>
        hasProtectedConstructionClaim(sector) ||
        (sector.constructionPropertyTransition &&
          sector.constructionPropertyTransition.kind !== "restore")
    )
  ) {
    return false;
  }

  const acquired: Array<{ sectorId: CorporateSector["_id"]; key: string }> = [];
  for (const sector of sectors) {
    const key = `restore:${sector._id.toHexString()}`;
    if (!(await acquireConstructionPropertyTransition(db, sector, key, "restore", true))) {
      await Promise.all(
        acquired.map(({ sectorId, key: acquiredKey }) =>
          releaseConstructionPropertyTransition(db, sectorId, acquiredKey)
        )
      );
      return false;
    }
    acquired.push({ sectorId: sector._id, key });
  }
  return true;
}

export async function reserveSectorsForTransition(
  db: Db,
  sectors: Array<
    Pick<
      CorporateSector,
      "_id" | "corporationId" | "constructionFinancing" | "constructionPropertyTransition"
    >
  >,
  kind: string,
  keyPrefix: string,
  allowSameKeyResume = false,
  /** Financed sites whose loans already follow them to the new owner. */
  constructionTransfers?: ConstructionBorrowerTransferPlan
): Promise<string[] | null> {
  const transferring = (sector: (typeof sectors)[number]) =>
    constructionTransfers?.hasTransfer(sector._id) === true;
  if (
    sectors.some((sector) => {
      const key = `${keyPrefix}:${sector._id.toHexString()}`;
      return (
        (transferring(sector)
          ? !!sector.constructionPropertyTransition
          : hasProtectedConstructionProperty(sector)) &&
        !(
          allowSameKeyResume &&
          sector.constructionPropertyTransition?.kind === kind &&
          sector.constructionPropertyTransition.key === key
        )
      );
    })
  )
    return null;
  const keys: Array<{ key: string; newlyAcquired: boolean }> = [];
  for (const sector of sectors) {
    const key = `${keyPrefix}:${sector._id.toHexString()}`;
    const alreadyOwned = sector.constructionPropertyTransition?.key === key;
    if (
      !(await acquireConstructionPropertyTransition(
        db,
        sector,
        key,
        kind,
        false,
        allowSameKeyResume,
        transferring(sector) ? constructionTransfers!.claimFilterFor(sector) : undefined
      ))
    ) {
      await Promise.all(
        sectors
          .slice(0, keys.length)
          .map((prior, index) =>
            keys[index]!.newlyAcquired
              ? releaseConstructionPropertyTransition(db, prior._id, keys[index]!.key)
              : Promise.resolve()
          )
      );
      return null;
    }
    keys.push({ key, newlyAcquired: !alreadyOwned });
  }
  return keys.map(({ key }) => key);
}

export async function releaseConstructionPropertyTransition(
  db: Db,
  sectorId: CorporateSector["_id"],
  key: string
): Promise<void> {
  await corporateSectorsCollection(db).updateOne(
    { _id: sectorId, "constructionPropertyTransition.key": key },
    { $unset: { constructionPropertyTransition: "" } }
  );
}
