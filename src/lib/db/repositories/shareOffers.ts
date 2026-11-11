import type { Collection, Document } from "mongodb";
import type { ShareOffer } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `shareOffers` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("shareOffers")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function shareOffersCollection<TSchema extends Document = ShareOffer>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("shareOffers");
}
