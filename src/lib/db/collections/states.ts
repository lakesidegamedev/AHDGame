import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { State } from "../types";

/** Typed `states` collection. Pass `db` when already connected to avoid an extra `getDb()` await. */
export async function getStatesCollection(db?: Db) {
  const database = db ?? (await getDb());
  return database.collection<State>("states");
}

/** Population inputs for seat apportionment and turnout. */
export const STATE_POPULATION_FIELDS = {
  _id: 1,
  population: 1,
  votingEligiblePopulation: 1,
} as const;
