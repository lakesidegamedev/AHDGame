import type { Collection, Document } from "mongodb";
import type { GovernorOfficeState } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `governorOfficeState` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("governorOfficeState")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function governorOfficeStateCollection<TSchema extends Document = GovernorOfficeState>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("governorOfficeState");
}
