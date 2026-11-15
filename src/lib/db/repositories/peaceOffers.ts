import type { Collection, Document } from "mongodb";
import type { PeaceOfferDoc } from "../types/peaceOffer";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `peaceOffers` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("peaceOffers")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function peaceOffersCollection<TSchema extends Document = PeaceOfferDoc>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("peaceOffers");
}
