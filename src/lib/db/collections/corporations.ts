import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { corporationsCollection } from "../repositories/corporations";

/** Typed `corporations` collection. Pass `db` when already connected to avoid an extra `getDb()` await. */
export async function getCorporationsCollection(db?: Db) {
  return corporationsCollection(db ?? (await getDb()));
}
