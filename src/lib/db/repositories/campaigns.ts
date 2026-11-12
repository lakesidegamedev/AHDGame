import type { Collection, Document } from "mongodb";
import type { Campaign } from "../types/campaign";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `campaigns` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("campaigns")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function campaignsCollection<TSchema extends Document = Campaign>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("campaigns");
}
