import type { Collection, CollectionOptions, Document } from "mongodb";
import type { User } from "../types/user";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `users` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("users")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function usersCollection<TSchema extends Document = User>(
  db: CollectionSource,
  options?: CollectionOptions
): Collection<TSchema> {
  return db.collection<TSchema>("users", options);
}
