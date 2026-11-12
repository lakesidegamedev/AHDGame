import type { Collection, Document } from "mongodb";
import type { IndexFundPosition } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `indexFundPositions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("indexFundPositions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function indexFundPositionsCollection<TSchema extends Document = IndexFundPosition>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("indexFundPositions");
}
