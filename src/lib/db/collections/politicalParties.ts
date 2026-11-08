import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { PoliticalParty } from "../types";

/** Typed `politicalParties` collection. Pass `db` when already connected to avoid an extra `getDb()` await. */
export async function getPoliticalPartiesCollection(db?: Db) {
  const database = db ?? (await getDb());
  return database.collection<PoliticalParty>("politicalParties");
}
