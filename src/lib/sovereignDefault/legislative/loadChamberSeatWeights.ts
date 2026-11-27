import { officialsCountryScope } from "@/lib/db/electedOfficialScope";
import type { Db } from "mongodb";
import { getCountryConfig, type CountryId } from "@/lib/constants/countries";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { chamberSeatWeights } from "./rules/seatWeights";

/** One projected read of canonical seats, rather than actor office mirrors. */
export async function loadChamberSeatWeights(
  db: Db,
  countryId: CountryId,
  chamberKey: string
): Promise<Map<string, number>> {
  const officeTypes = getCountryConfig(countryId)
    .officeTypes.filter((office) => office.chamberKey === chamberKey)
    .map((office) => office.key);
  const officials = await electedOfficialsCollection(db)
    .find(
      {
        ...officialsCountryScope(countryId),
        officeType: { $in: officeTypes },
      },
      { projection: { characterId: 1, nppId: 1, isNPP: 1, seatsHeld: 1 } }
    )
    .toArray();
  return chamberSeatWeights(
    officials.map((official) => ({
      actorId:
        (official.isNPP
          ? (official.nppId ?? official.characterId)
          : official.characterId
        )?.toString() ?? "",
      seatsHeld: official.seatsHeld,
    }))
  );
}
