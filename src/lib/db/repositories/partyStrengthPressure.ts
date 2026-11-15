import type { Collection, Document } from "mongodb";
import type { PartyStrengthPressure } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `partyStrengthPressure` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("partyStrengthPressure")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function partyStrengthPressureCollection<TSchema extends Document = PartyStrengthPressure>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("partyStrengthPressure");
}
