import type { Collection, Document } from "mongodb";
import type { DocketCase } from "../types/scotus";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `docketCases` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("docketCases")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function docketCasesCollection<TSchema extends Document = DocketCase>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("docketCases");
}
