import type { Collection, Document } from "mongodb";
import type { NationalizationAuction } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `nationalizationAuctions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("nationalizationAuctions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function nationalizationAuctionsCollection<
  TSchema extends Document = NationalizationAuction,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("nationalizationAuctions");
}
