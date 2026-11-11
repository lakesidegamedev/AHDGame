import type { Db, ObjectId } from "mongodb";
import type { PoliticalParty } from "@/lib/db/types";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";

/**
 * Vacate party leadership slots (chair / vice chair / treasurer) that still
 * reference characters who have left for another party.
 *
 * The canonical leave route nulls the leaver's leadership slot, but bulk
 * party-split paths only move `character.party` and never clear the old
 * party's leadership. This clears any slot referencing a departed character,
 * scoped to the country. Pass `exceptPartySequentialId` to exclude the
 * freshly-created party whose leadership was intentionally set to them.
 * `$cond` preserves slots held by characters who did not depart.
 *
 * No-op when `departedCharacterIds` is empty.
 */
export async function vacateDepartedLeadership(
  db: Db,
  countryId: string,
  departedCharacterIds: ObjectId[],
  opts: { exceptPartySequentialId?: number } = {}
): Promise<void> {
  if (departedCharacterIds.length === 0) return;

  const ids = departedCharacterIds;
  const filter: Record<string, unknown> = {
    countryId,
    $or: [{ chairId: { $in: ids } }, { viceChairId: { $in: ids } }, { treasurerId: { $in: ids } }],
  };
  if (opts.exceptPartySequentialId !== undefined) {
    filter.sequentialId = { $ne: opts.exceptPartySequentialId };
  }

  await politicalPartiesCollection(db).updateMany(filter, [
    {
      $set: {
        chairId: { $cond: [{ $in: ["$chairId", ids] }, null, "$chairId"] },
        viceChairId: { $cond: [{ $in: ["$viceChairId", ids] }, null, "$viceChairId"] },
        treasurerId: { $cond: [{ $in: ["$treasurerId", ids] }, null, "$treasurerId"] },
        updatedAt: new Date(),
      },
    },
  ]);
}
