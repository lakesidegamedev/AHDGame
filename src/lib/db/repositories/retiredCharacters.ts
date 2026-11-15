import type { Collection, Document } from "mongodb";
import type { RetiredCharacter } from "../types/retiredCharacter";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `retiredCharacters` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("retiredCharacters")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function retiredCharactersCollection<TSchema extends Document = RetiredCharacter>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("retiredCharacters");
}
