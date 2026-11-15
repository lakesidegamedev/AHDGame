/**
 * A Commons-based prime minister retains office only while holding a lower-chamber seat.
 * hasRequiredPrimeMinisterSeat reads the seat register for player and NPP holders;
 * an explicitly pinned singleplayer head of state keeps the scenario's office.
 */
import type { Db, ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { ElectedOfficial } from "@/lib/db/types";
import { isSingleplayer } from "@/lib/singleplayer";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { getLowerChamberOfficeType } from "@/lib/legislature/chamberOfficeType";

export async function hasRequiredPrimeMinisterSeat(
  db: Db,
  countryId: CountryId,
  characterId: ObjectId | null | undefined,
  nppId: ObjectId | null | undefined
): Promise<boolean> {
  if (!countryHasFeature("pmRequiresLowerSeat", countryId)) return true;
  const officeType = getLowerChamberOfficeType(countryId);
  if (
    countryHasFeature("pinnedSingleplayerPmSeatExemption", countryId) &&
    characterId &&
    isSingleplayer()
  ) {
    const pinned = await charactersCollection(db).findOne(
      {
        _id: characterId,
        countryId,
        singleplayerHeadOfState: true,
        retiredAt: { $exists: false },
      },
      { projection: { _id: 1 } }
    );
    if (pinned) return true;
  }
  if (!characterId && !nppId) return false;
  const officials = electedOfficialsCollection(db);
  const projection = { projection: { _id: 1 } } as const;
  if (characterId) {
    const seat = await officials.findOne({ countryId, officeType, characterId }, projection);
    return seat !== null;
  }
  if (!nppId) return false;
  const seat = await officials.findOne({ countryId, officeType, nppId, isNPP: true }, projection);
  return seat !== null;
}
