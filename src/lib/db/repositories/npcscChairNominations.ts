import type { Collection, Document } from "mongodb";
import type { NpcscChairNomination } from "../types/leadership";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `npcscChairNominations` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("npcscChairNominations")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function npcscChairNominationsCollection<TSchema extends Document = NpcscChairNomination>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("npcscChairNominations");
}
