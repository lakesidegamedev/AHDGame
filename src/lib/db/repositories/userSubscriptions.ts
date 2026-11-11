import type { Collection, Document } from "mongodb";
import type { UserSubscription } from "../types/userSubscription";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `userSubscriptions` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("userSubscriptions")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function userSubscriptionsCollection<TSchema extends Document = UserSubscription>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("userSubscriptions");
}
