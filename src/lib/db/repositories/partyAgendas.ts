import type { Collection, Document } from "mongodb";
import type { PartyAgenda } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `partyAgendas` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("partyAgendas")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function partyAgendasCollection<TSchema extends Document = PartyAgenda>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("partyAgendas");
}
