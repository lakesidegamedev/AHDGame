import type { Collection, Document } from "mongodb";
import type { ElectedOfficial } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `electedOfficials` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("electedOfficials")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function electedOfficialsCollection<TSchema extends Document = ElectedOfficial>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("electedOfficials");
}
