import type { Collection, Document } from "mongodb";
import type { PartyCharter } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `partyCharters` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("partyCharters")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function partyChartersCollection<TSchema extends Document = PartyCharter>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("partyCharters");
}
