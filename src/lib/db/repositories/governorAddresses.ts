import type { Collection, Document } from "mongodb";
import type { GovernorAddress } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `governorAddresses` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("governorAddresses")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function governorAddressesCollection<TSchema extends Document = GovernorAddress>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("governorAddresses");
}
