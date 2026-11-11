import type { Collection, Document } from "mongodb";
import type { OrganizationMembership } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `organizationMemberships` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("organizationMemberships")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function organizationMembershipsCollection<
  TSchema extends Document = OrganizationMembership,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("organizationMemberships");
}
