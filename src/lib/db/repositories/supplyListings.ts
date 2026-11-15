import type { Collection, Document } from "mongodb";
import type { SupplyListing } from "../types/supplyListing";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `supplyListings` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("supplyListings")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function supplyListingsCollection<TSchema extends Document = SupplyListing>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("supplyListings");
}
