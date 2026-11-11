import type { Collection, Document } from "mongodb";
import type { PartyPoliticalStrengthLedgerRow } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `partyPoliticalStrengthLedger` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("partyPoliticalStrengthLedger")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function partyPoliticalStrengthLedgerCollection<
  TSchema extends Document = PartyPoliticalStrengthLedgerRow,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("partyPoliticalStrengthLedger");
}
