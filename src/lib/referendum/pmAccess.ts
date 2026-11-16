import type { Db, ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { getHeadOfGovernmentCharacterId } from "@/lib/api/headOfGovernment";
import { isPartyOfficer, nppHeadOfGovernmentPartyId } from "./nppDecisionMaker";

/**
 * Human heads of government act personally: the Prime Minister, or the President
 * in a presidential country. A non-player head's party chair or vice-chair may
 * act for it.
 */
export async function canDecideReferendum(
  db: Db,
  countryId: CountryId,
  characterId: ObjectId
): Promise<boolean> {
  const headId = await getHeadOfGovernmentCharacterId(db, countryId);
  if (headId) return headId.equals(characterId);
  const partyId = await nppHeadOfGovernmentPartyId(db, countryId);
  return partyId != null && (await isPartyOfficer(db, countryId, partyId, characterId));
}
