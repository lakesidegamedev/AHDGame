import { ObjectId, type Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";

/**
 * True when the viewer holds shares (> 0) in `corporation`, either directly
 * through their character or through a corporation they run. Read access only:
 * management actions keep their own CEO checks.
 */
export async function viewerHoldsShares(
  db: Db,
  corporation: Pick<Corporation, "shareholders">,
  viewerUserId: string | undefined | null
): Promise<boolean> {
  if (!viewerUserId || !ObjectId.isValid(viewerUserId)) return false;
  const holders = (corporation.shareholders ?? []).filter((sh) => (sh.shares ?? 0) > 0);
  if (holders.length === 0) return false;
  const userId = new ObjectId(viewerUserId);

  if (holders.some((sh) => sh.characterId)) {
    const character = await charactersCollection(db).findOne(
      { userId },
      { projection: { _id: 1 } }
    );
    if (
      character &&
      holders.some((sh) => sh.characterId && sh.characterId.toString() === character._id.toString())
    ) {
      return true;
    }
  }

  const holderCorpIds = holders.flatMap((sh) => (sh.corporationId ? [sh.corporationId] : []));
  if (holderCorpIds.length > 0) {
    const ownCorp = await corporationsCollection(db).findOne(
      { _id: { $in: holderCorpIds }, userId, ceoVacant: { $ne: true } },
      {
        projection: { _id: 1 },
      }
    );
    if (ownCorp) return true;
  }
  return false;
}
