import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { ConflictDoc } from "@/lib/db/types/conflict";
import { getConflictsCollection } from "@/lib/db/collections/conflicts";
import type { Side } from "@/lib/military/occupation";

/**
 * Enrol a country as a belligerent on one side of a conflict.
 *
 * Lifted out of `battleResolution` once a second caller appeared: a war declaration
 * enrols the declarer at enactment, and battle resolution enrols whoever actually
 * fights. A second copy would have drifted.
 *
 * Idempotent, and it mutates the in-memory roster as well as the document so the
 * rest of the current tick sees a consistent conflict.
 */
export async function joinSide(
  db: Db,
  conflict: ConflictDoc,
  countryId: CountryId,
  side: Side,
  currentTurn: number
): Promise<void> {
  const roster = side === "A" ? conflict.sideA.countries : conflict.sideB.countries;
  if (roster.includes(countryId)) return;
  roster.push(countryId);

  // Stamp WHEN this country entered and WHERE the front stood. Both halves
  // are load-bearing for war approval: exhaustion clock runs from own entry,
  // and war effort is scored from the front on arrival so late joiners do not
  // inherit their side's prior record. `treatyEntries` cannot serve: only
  // written for treaty-pulled allies, not declarers into an existing war.
  //
  // Two updates, not one. `$addToSet` dedupes the country-code roster, but an
  // entry object compares whole, so two callers enrolling the same country
  // could each pass the in-memory check and insert a second stamp. Filtering
  // on `joinTurns.countryId` in the update makes the database enforce one
  // stamp per country.
  const entry = { countryId, turn: currentTurn, control: conflict.control };
  if (!conflict.joinTurns?.some((existing) => existing.countryId === countryId)) {
    conflict.joinTurns = [...(conflict.joinTurns ?? []), entry];
  }

  const conflicts = getConflictsCollection(db);
  await conflicts.updateOne(
    { _id: conflict._id },
    { $addToSet: { [`side${side}.countries`]: countryId } }
  );
  await conflicts.updateOne(
    { _id: conflict._id, "joinTurns.countryId": { $ne: countryId } },
    { $push: { joinTurns: entry } }
  );
}

/** Enrol several coalition partners with one conflict write. */
export async function joinManyToSide(
  db: Db,
  conflict: ConflictDoc,
  countryIds: CountryId[],
  side: Side,
  currentTurn: number
): Promise<void> {
  const roster = side === "A" ? conflict.sideA.countries : conflict.sideB.countries;
  const opposing = side === "A" ? conflict.sideB.countries : conflict.sideA.countries;
  const entrants = [...new Set(countryIds)].filter(
    (countryId) => !roster.includes(countryId) && !opposing.includes(countryId)
  );
  if (entrants.length === 0) return;

  roster.push(...entrants);
  const existingJoinTurns = new Set((conflict.joinTurns ?? []).map((entry) => entry.countryId));
  const entries = entrants
    .filter((countryId) => !existingJoinTurns.has(countryId))
    .map((countryId) => ({ countryId, turn: currentTurn, control: conflict.control }));
  conflict.joinTurns = [...(conflict.joinTurns ?? []), ...entries];

  await getConflictsCollection(db).updateOne(
    { _id: conflict._id },
    {
      $addToSet: {
        [`side${side}.countries`]: { $each: entrants },
        ...(entries.length > 0 ? { joinTurns: { $each: entries } } : {}),
      },
    }
  );
}
