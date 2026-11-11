import type { ClientSession, Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { State } from "@/lib/db/types/state";
import type { SuccessionResident } from "./rules/residency";
import { buildSourceRegionHierarchy } from "./sourceRegionHierarchy";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { statesCollection } from "@/lib/db/repositories/states";

/** Read every character resident in the source country and resolve nested
 * home states to the actual top-level regions being partitioned. No character
 * or original-nationality field is mutated here. */
export async function loadLiveSuccessionResidents(
  db: Db,
  sourceCountryId: CountryId,
  session?: ClientSession
): Promise<SuccessionResident[]> {
  const states = await statesCollection(db)
    .find({ countryId: sourceCountryId }, { session })
    .toArray();
  const { topLevelFor } = buildSourceRegionHierarchy(states);
  const characters = await charactersCollection(db)
    .find({ countryId: sourceCountryId }, { session })
    .toArray();
  return characters
    .map((character) => {
      const homeRegionId = topLevelFor(character.homeState);
      if (!homeRegionId) throw new Error("A source resident has no valid federation home region");
      return {
        characterId: character._id.toString(),
        countryId: sourceCountryId,
        homeState: character.homeState,
        homeRegionId,
      };
    })
    .sort((a, b) => a.characterId.localeCompare(b.characterId));
}
