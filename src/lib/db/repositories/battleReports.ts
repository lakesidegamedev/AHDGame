import type { Collection, Document } from "mongodb";
import type { BattleReportDoc } from "../types/battleReport";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `battleReports` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("battleReports")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function battleReportsCollection<TSchema extends Document = BattleReportDoc>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("battleReports");
}
