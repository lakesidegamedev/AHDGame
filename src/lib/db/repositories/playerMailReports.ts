import type { Collection, Document } from "mongodb";
import type { PlayerMailReport } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `playerMailReports` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("playerMailReports")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function playerMailReportsCollection<TSchema extends Document = PlayerMailReport>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("playerMailReports");
}
