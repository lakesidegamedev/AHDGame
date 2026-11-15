import type { Collection, Document } from "mongodb";
import type { NpcscChairElection } from "../types/leadership";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `npcscChairElections` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("npcscChairElections")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function npcscChairElectionsCollection<TSchema extends Document = NpcscChairElection>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("npcscChairElections");
}
