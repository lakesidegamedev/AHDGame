import type { Collection, Document } from "mongodb";
import type { StateDemographicTurnout } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `stateDemographicTurnout` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("stateDemographicTurnout")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function stateDemographicTurnoutCollection<
  TSchema extends Document = StateDemographicTurnout,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("stateDemographicTurnout");
}
