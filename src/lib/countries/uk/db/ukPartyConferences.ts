import type { Db } from "mongodb";
import type { UKPartyConference } from "@/lib/countries/uk/conference/types";
import type { UKPartyPlatform } from "@/lib/countries/uk/conference/types";
import { ukPartyConferencesCollection } from "@/lib/db/repositories/ukPartyConferences";
import { ukPartyPlatformsCollection } from "@/lib/db/repositories/ukPartyPlatforms";

/** Annual UK party-conference lifecycle rows (epic #856, ticket #862). */
export function getUKPartyConferencesCollection(db: Db) {
  return ukPartyConferencesCollection<UKPartyConference>(db);
}

/** Ratified standing platforms, one row per UK party (ticket #862). */
export function getUKPartyPlatformsCollection(db: Db) {
  return ukPartyPlatformsCollection<UKPartyPlatform>(db);
}
