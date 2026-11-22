import type { Db, ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { OfficeType } from "@/lib/db/types";
import { getCabinetEligibleOfficeTypes } from "@/lib/legislature/chamberOfficeType";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { charactersCollection } from "@/lib/db/repositories/characters";

export async function restoreCharacterOfficeAfterCabinet(
  db: Db,
  countryId: CountryId,
  holderCharacterId: ObjectId,
  now: Date
): Promise<void> {
  const eligibleOfficeTypes = getCabinetEligibleOfficeTypes(countryId);
  const lowerOfficial = await electedOfficialsCollection(db).findOne({
    characterId: holderCharacterId,
    officeType: { $in: eligibleOfficeTypes },
    countryId,
  });
  if (lowerOfficial) {
    const restoreOffice = {
      type: lowerOfficial.officeType,
      state: lowerOfficial.state,
      ...(lowerOfficial.constituencyId
        ? {
            constituency: lowerOfficial.constituency ?? lowerOfficial.constituencyId,
            constituencyId: lowerOfficial.constituencyId,
          }
        : {}),
    } as OfficeType;
    await charactersCollection(db).updateOne(
      { _id: holderCharacterId },
      { $set: { currentOffice: restoreOffice, updatedAt: now } }
    );
  } else {
    await charactersCollection(db).updateOne(
      { _id: holderCharacterId },
      { $unset: { currentOffice: "" }, $set: { updatedAt: now } }
    );
  }
}
