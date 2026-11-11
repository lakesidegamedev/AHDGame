import type { Collection, Document } from "mongodb";
import type { Ticket } from "../types/ticket";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `tickets` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("tickets")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function ticketsCollection<TSchema extends Document = Ticket>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("tickets");
}
