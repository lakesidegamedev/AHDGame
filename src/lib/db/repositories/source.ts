import type { Collection, Document } from "mongodb";

/**
 * Anything that can hand out a collection by name: a `Db`, a session-bound
 * `Db`, or the in-memory database the headless harness uses.
 */
export interface CollectionSource {
  collection<TSchema extends Document = Document>(name: string): Collection<TSchema>;
}
