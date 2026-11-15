import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { ElectedOfficial } from "../types";

/** Typed `electedOfficials` collection. Pass `db` when already connected to avoid an extra `getDb()` await. */
export async function getElectedOfficialsCollection(db?: Db) {
  const database = db ?? (await getDb());
  return database.collection<ElectedOfficial>("electedOfficials");
}
