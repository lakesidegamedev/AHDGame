import type { Collection, Document } from "mongodb";
import type { CabinetMember } from "../types/cabinet";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `cabinetMembers` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("cabinetMembers")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function cabinetMembersCollection<TSchema extends Document = CabinetMember>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("cabinetMembers");
}
