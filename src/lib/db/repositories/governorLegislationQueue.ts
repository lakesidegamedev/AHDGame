import type { Collection, Document } from "mongodb";
import type { GovernorQueuedBill } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `governorLegislationQueue` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("governorLegislationQueue")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function governorLegislationQueueCollection<TSchema extends Document = GovernorQueuedBill>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("governorLegislationQueue");
}
