import type { Collection, Document } from "mongodb";
import type { NationalArsenal } from "../types/nationalArsenal";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `nationalArsenal` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("nationalArsenal")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function nationalArsenalCollection<TSchema extends Document = NationalArsenal>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("nationalArsenal");
}
