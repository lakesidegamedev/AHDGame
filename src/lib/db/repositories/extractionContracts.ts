import type { Collection, Document } from "mongodb";
import type { ExtractionContract } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `extractionContracts` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("extractionContracts")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function extractionContractsCollection<TSchema extends Document = ExtractionContract>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("extractionContracts");
}
