import type { Db } from "@/lib/mongodb";
import type { PoliticalParty } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";

/**
 * Load political parties for a specific country into a map keyed by String(party.sequentialId).
 * @param db - Database connection
 * @param countryId - Required country to filter parties (prevents cross-country ID collisions)
 */
export async function getPartyMap(
  db: Db,
  countryId: CountryId
): Promise<Map<string, PoliticalParty>> {
  const parties = await db
    .collection<PoliticalParty>("politicalParties")
    .find({ countryId })
    .toArray();
  return new Map(parties.map((p) => [String(p.sequentialId), p]));
}
