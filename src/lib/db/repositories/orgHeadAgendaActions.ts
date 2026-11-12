import type { Collection, Document } from "mongodb";
import type { OrgHeadAgendaPool } from "../types/orgHeadAgendaAction";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `orgHeadAgendaActions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("orgHeadAgendaActions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function orgHeadAgendaActionsCollection<TSchema extends Document = OrgHeadAgendaPool>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("orgHeadAgendaActions");
}
