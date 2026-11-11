import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { charactersCollection } from "../repositories/characters";

/**
 * Typed `characters` collection. Pass `db` when already connected to avoid an extra
 * `getDb()` await (e.g. turn processing).
 */
export async function getCharactersCollection(db?: Db) {
  return charactersCollection(db ?? (await getDb()));
}
