import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { Corporation } from "../types";

/** Typed `corporations` collection. Pass `db` when already connected to avoid an extra `getDb()` await. */
export async function getCorporationsCollection(db?: Db) {
  const database = db ?? (await getDb());
  return database.collection<Corporation>("corporations");
}
