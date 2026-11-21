import type { Db, ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { getGovernmentFormationsCollection } from "@/lib/db/collections/governmentFormation";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { getCountryState } from "@/lib/countryState";

/**
 * The party of the country's non-player head of government, or null when a
 * player holds the office (or nobody does). A prime minister's party is the
 * governing party of the formed ministry; a president's is their own party.
 */
export async function nppHeadOfGovernmentPartyId(
  db: Db,
  countryId: CountryId
): Promise<string | null> {
  const runtime = await getCountryState(db, countryId);
  if (runtime.governmentType === "presidential") {
    const president = await electedOfficialsCollection(db).findOne(
      { countryId, officeType: "president", characterId: null },
      { projection: { party: 1 } }
    );
    return president?.party ? String(president.party) : null;
  }
  const ministry = await getGovernmentFormationsCollection(db).findOne({ _id: countryId });
  if (
    !ministry ||
    ministry.status !== "formed" ||
    !ministry.pmNppId ||
    ministry.pmCharacterId ||
    !ministry.governingPartyId
  )
    return null;
  return String(ministry.governingPartyId);
}

/** Countries whose referendum decision belongs to a non-player head of government. */
export async function countriesWithNppDecisionMaker(
  db: Db,
  countryIds: readonly CountryId[]
): Promise<Set<CountryId>> {
  const held = new Set<CountryId>();
  for (const countryId of countryIds) {
    if ((await nppHeadOfGovernmentPartyId(db, countryId)) != null) held.add(countryId);
  }
  return held;
}

/** True when the character chairs or vice-chairs the given party of the country. */
export async function isPartyOfficer(
  db: Db,
  countryId: CountryId,
  partyId: string,
  characterId: ObjectId
): Promise<boolean> {
  const party = await politicalPartiesCollection(db).findOne(
    { countryId, sequentialId: Number(partyId) },
    { projection: { chairId: 1, viceChairId: 1 } }
  );
  return (
    party?.chairId?.equals(characterId) === true || party?.viceChairId?.equals(characterId) === true
  );
}
