import type { Collection, Document } from "mongodb";
import type { PlayerMail } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `playerMail` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("playerMail")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function playerMailCollection<TSchema extends Document = PlayerMail>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("playerMail");
}
