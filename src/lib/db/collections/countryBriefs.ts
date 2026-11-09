import type { Db } from "mongodb";
import type { CountryBrief } from "@/lib/db/types/countryBrief";

export function getCountryBriefsCollection(db: Db) {
  return db.collection<CountryBrief>("countryBriefs");
}
