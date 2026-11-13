import type { Db, ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { getLowerChamberOfficeType } from "@/lib/legislature/chamberOfficeType";
import { getElectedOfficialsCollection } from "@/lib/db/collections/electedOfficials";
import { getCharactersCollection } from "@/lib/db/collections/characters";
import { getNppsCollection } from "@/lib/db/collections/npps";

/** Executive departure leaves an independently retained elected seat intact. */
export async function restoreParliamentarySeats(
  db: Db,
  countryId: CountryId,
  characterIds: ObjectId[],
  nppIds: ObjectId[],
  now: Date
): Promise<void> {
  if (
    !countryHasFeature("pmRequiresLowerSeat", countryId) ||
    (!characterIds.length && !nppIds.length)
  )
    return;
  const lowerOffice = getLowerChamberOfficeType(countryId);
  const seats = await (
    await getElectedOfficialsCollection(db)
  )
    .find(
      {
        countryId,
        officeType: lowerOffice,
        $or: [{ characterId: { $in: characterIds } }, { nppId: { $in: nppIds } }],
      },
      { projection: { characterId: 1, nppId: 1, state: 1, seatsHeld: 1 } }
    )
    .toArray();
  const playerWrites = [];
  const nppWrites = [];
  for (const seat of seats) {
    const update = {
      $set: {
        currentOffice: { type: lowerOffice, state: seat.state, seatsHeld: seat.seatsHeld ?? 1 },
        updatedAt: now,
      },
    };
    if (seat.characterId)
      playerWrites.push({ updateOne: { filter: { _id: seat.characterId, countryId }, update } });
    if (seat.nppId)
      nppWrites.push({ updateOne: { filter: { _id: seat.nppId, countryId }, update } });
  }
  if (playerWrites.length) await (await getCharactersCollection(db)).bulkWrite(playerWrites);
  if (nppWrites.length) await (await getNppsCollection(db)).bulkWrite(nppWrites);
}
