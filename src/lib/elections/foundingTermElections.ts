// Server-only: kept apart from executiveTermLimits, which client components import.
import { ObjectId } from "mongodb";
import type { Db } from "@/lib/mongodb";
import type { CountryId } from "@/lib/constants/countries";
import {
  getExecutiveTermEvents,
  type CharacterExecutiveTermSnapshot,
} from "@/lib/elections/executiveTermLimits";

/**
 * Ids of the founding (cycle 0, world-start) races among these characters'
 * executive terms. Founding terms do not count toward the term limit.
 */
export async function loadFoundingElectionIds(
  db: Db,
  characters: CharacterExecutiveTermSnapshot[],
  countryId: CountryId
): Promise<Set<string>> {
  const ids = [
    ...new Set(
      characters.flatMap((character) =>
        getExecutiveTermEvents(character, countryId).flatMap((event) =>
          event.electionId && ObjectId.isValid(event.electionId) ? [event.electionId] : []
        )
      )
    ),
  ];
  if (ids.length === 0) return new Set();
  const founding = await db
    .collection("elections")
    .find({ _id: { $in: ids.map((id) => new ObjectId(id)) }, cycle: 0 }, { projection: { _id: 1 } })
    .toArray();
  return new Set(founding.map((election) => election._id.toString()));
}
