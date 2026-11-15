import type { Collection, Document } from "mongodb";
import type { OrganizationLeadership } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `organizationLeadership` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("organizationLeadership")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function organizationLeadershipCollection<TSchema extends Document = OrganizationLeadership>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("organizationLeadership");
}
