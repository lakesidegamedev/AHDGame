import type { Collection, Document } from "mongodb";
import type { PartyHistorySnapshot } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `partyHistory` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("partyHistory")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function partyHistoryCollection<TSchema extends Document = PartyHistorySnapshot>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("partyHistory");
}
