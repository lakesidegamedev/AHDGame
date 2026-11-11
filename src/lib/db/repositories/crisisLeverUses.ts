import type { Collection, Document } from "mongodb";
import type { CrisisLeverUse } from "../types/crisis";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `crisisLeverUses` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("crisisLeverUses")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function crisisLeverUsesCollection<TSchema extends Document = CrisisLeverUse>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("crisisLeverUses");
}
