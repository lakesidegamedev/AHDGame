import type { Collection, Document } from "mongodb";
import type { CorporateSector } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `corporateSectors` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("corporateSectors")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function corporateSectorsCollection<TSchema extends Document = CorporateSector>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("corporateSectors");
}
