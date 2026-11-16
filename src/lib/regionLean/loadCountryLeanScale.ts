import type { Db } from "mongodb";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { countryLeanScale, type CountryLeanScale } from "./scale";

/** The country's lean scale from its stored parties. */
export async function loadCountryLeanScale(db: Db, countryId: string): Promise<CountryLeanScale> {
  const parties = await politicalPartiesCollection(db)
    .find(
      { countryId },
      {
        projection: {
          sequentialId: 1,
          name: 1,
          abbreviation: 1,
          economicPosition: 1,
          socialPosition: 1,
          isDefault: 1,
          memberCount: 1,
        },
      }
    )
    .toArray();
  return countryLeanScale(parties.map((p) => ({ ...p, id: String(p.sequentialId) })));
}
