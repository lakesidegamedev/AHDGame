import type { Collection, Document } from "mongodb";
import type { UnownedSector } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `unownedSectors` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("unownedSectors")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function unownedSectorsCollection<TSchema extends Document = UnownedSector>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("unownedSectors");
}
