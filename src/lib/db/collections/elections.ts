import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { Election } from "../types";

/** Typed `elections` collection. Pass `db` when already connected to avoid an extra `getDb()` await. */
export async function getElectionsCollection(db?: Db) {
  const database = db ?? (await getDb());
  return database.collection<Election>("elections");
}
