import type { Db, ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { resolveControllingCorporateParent } from "@/lib/corporations/reservedCorporateHoldings";
import { isSubsidiaryCorporationsEnabled } from "./featureFlag";

/**
 * True iff `callerUserId` is the sitting CEO (owner) of the corporation that
 * currently controls `sub` (>50% voting power), AND `sub` is formalized as a
 * managed subsidiary, AND the feature flag is on.
 *
 * Parent authority is DERIVED here on every call: the controlling parent is
 * recomputed from `sub.shareholders` plus unsold shares still reserved in
 * open corp-placed sell orders/listings, so listing a controlling block for
 * sale does not silently drop parent powers before the trade fills. `userId`
 * is never used to carry parent authority.
 */
export async function canActOnCorporationAsParent(
  db: Db,
  callerUserId: ObjectId,
  sub: Corporation
): Promise<boolean> {
  if (!(await isSubsidiaryCorporationsEnabled())) return false;
  if (sub.subsidiaryFormalizedAtTurn == null) return false;
  if (sub.countryOwnerId) return false;

  const controllingParent = await resolveControllingCorporateParent(db, sub);
  if (!controllingParent) return false;

  const parent = await db
    .collection<Corporation>("corporations")
    .findOne({ _id: controllingParent.corporationId }, { projection: { userId: 1, ceoVacant: 1 } });
  if (!parent) return false;
  if (parent.ceoVacant === true) return false;
  if (!parent.userId) return false;
  return parent.userId.equals(callerUserId);
}

/** True when no player sits in the corporation's CEO chair, so an AI manager runs it. */
export function isAiRunCorporation(sub: Pick<Corporation, "ceoType" | "ceoVacant">): boolean {
  return sub.ceoVacant === true || sub.ceoType === "npp";
}

/**
 * True iff `callerUserId` may steer an AI-run subsidiary's operations (sector
 * retooling, logo) as the controlling parent's CEO. Same control rule as
 * `canActOnCorporationAsParent`; a subsidiary with a sitting player CEO keeps
 * those decisions with its own CEO.
 */
export async function canDirectSubsidiaryAsParent(
  db: Db,
  callerUserId: ObjectId,
  sub: Corporation
): Promise<boolean> {
  if (!isAiRunCorporation(sub)) return false;
  return canActOnCorporationAsParent(db, callerUserId, sub);
}

/**
 * The controlling parent corporation's id when `callerUserId` may direct `sub`
 * as its parent CEO, else null. Used to stamp who directed a change.
 */
export async function directingParentCorporationId(
  db: Db,
  callerUserId: ObjectId,
  sub: Corporation
): Promise<ObjectId | null> {
  if (!(await canDirectSubsidiaryAsParent(db, callerUserId, sub))) return null;
  return (await resolveControllingCorporateParent(db, sub))?.corporationId ?? null;
}
