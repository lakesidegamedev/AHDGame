import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { NPP } from "../types";

/** Typed `npps` collection. Pass `db` when already connected to avoid an extra `getDb()` await. */
export async function getNppsCollection(db?: Db) {
  const database = db ?? (await getDb());
  return database.collection<NPP>("npps");
}
