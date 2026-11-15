import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { ConflictDoc } from "@/lib/db/types/conflict";
import { getConflictsCollection } from "@/lib/db/collections/conflicts";
import { opposedBelligerents } from "@/lib/military/occupation";

/**
 * The live war these two countries are already fighting against each other, if any.
 *
 * ONE war at a time between the same pair. Both `validateDeclareWar` (at
 * proposal) and `declareWar` (at enactment) call this, because a bill sits
 * before the chambers for turns and the pair can become opposed in the
 * meantime via a third country's war.
 *
 * ONE shared function, not a copy in each caller: a past pass-rule change
 * diverged between validator and engine with no type error to catch it.
 *
 * Scanned across every live conflict, not host-scoped, because a pair can be
 * opposed in a war hosted by a third country.
 */
export async function findWarBetween(
  db: Db,
  x: CountryId,
  y: CountryId
): Promise<ConflictDoc | null> {
  // Mongo narrows to conflicts holding BOTH countries; `opposedBelligerents` then
  // confirms they are on OPPOSING rosters rather than side by side.
  const shared = await getConflictsCollection(db)
    .find({
      status: { $ne: "resolved" },
      $and: [
        { $or: [{ "sideA.countries": x }, { "sideB.countries": x }] },
        { $or: [{ "sideA.countries": y }, { "sideB.countries": y }] },
      ],
    })
    .toArray();
  return shared.find((c) => opposedBelligerents(c, x, y)) ?? null;
}
