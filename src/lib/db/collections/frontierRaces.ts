import type { Db } from "mongodb";
import type { FrontierRaceState } from "@/lib/db/types/frontierRace";

export function getFrontierRacesCollection(db: Db) {
  return db.collection<FrontierRaceState>("frontierRaces");
}
