import type { Collection, Document } from "mongodb";
import type { CorporationShareInvite } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `corporationShareInvites` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("corporationShareInvites")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function corporationShareInvitesCollection<
  TSchema extends Document = CorporationShareInvite,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("corporationShareInvites");
}
