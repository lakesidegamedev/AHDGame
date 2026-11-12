import type { Collection, Document } from "mongodb";
import type { ImperialCharacter } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `imperialCharacters` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("imperialCharacters")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function imperialCharactersCollection<TSchema extends Document = ImperialCharacter>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("imperialCharacters");
}
