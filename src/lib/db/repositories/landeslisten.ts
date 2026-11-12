import type { Collection, Document } from "mongodb";
import type { Landesliste } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `landeslisten` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("landeslisten")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function landeslistenCollection<TSchema extends Document = Landesliste>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("landeslisten");
}
