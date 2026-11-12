import type { Collection, Document } from "mongodb";
import type { SupremeCourtSeat } from "../types/scotus";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `supremeCourtSeats` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("supremeCourtSeats")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function supremeCourtSeatsCollection<TSchema extends Document = SupremeCourtSeat>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("supremeCourtSeats");
}
