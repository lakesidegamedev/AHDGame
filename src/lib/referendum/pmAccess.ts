import type { Db, ObjectId } from "mongodb";
import type { PoliticalParty } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { getHeadOfGovernmentCharacterId } from "@/lib/api/headOfGovernment";
import { getGovernmentFormationsCollection } from "@/lib/db/collections/governmentFormation";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";

/** Human PMs act personally. An NPP PM's party chair/vice-chair may act for it. */
export async function canDecideReferendum(
  db: Db,
  countryId: CountryId,
  characterId: ObjectId
): Promise<boolean> {
  const pmId = await getHeadOfGovernmentCharacterId(db, countryId);
  if (pmId) return pmId.equals(characterId);
  const ministry = await getGovernmentFormationsCollection(db).findOne({ _id: countryId });
  if (
    !ministry ||
    ministry.status !== "formed" ||
    !ministry.pmNppId ||
    ministry.pmCharacterId ||
    !ministry.governingPartyId
  )
    return false;
  const party = await politicalPartiesCollection(db).findOne(
    { countryId, sequentialId: Number(ministry.governingPartyId) },
    { projection: { chairId: 1, viceChairId: 1 } }
  );
  return (
    party?.chairId?.equals(characterId) === true || party?.viceChairId?.equals(characterId) === true
  );
}
