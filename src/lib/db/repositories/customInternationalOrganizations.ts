import type { Collection, Document } from "mongodb";
import type { CustomInternationalOrganization } from "../types/customInternationalOrganization";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `customInternationalOrganizations` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("customInternationalOrganizations")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function customInternationalOrganizationsCollection<
  TSchema extends Document = CustomInternationalOrganization,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("customInternationalOrganizations");
}
