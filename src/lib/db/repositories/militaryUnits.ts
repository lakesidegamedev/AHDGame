import type { Collection, Document } from "mongodb";
import type { MilitaryUnit } from "../types/militaryUnit";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `militaryUnits` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("militaryUnits")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function militaryUnitsCollection<TSchema extends Document = MilitaryUnit>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("militaryUnits");
}
