import type { Collection, Document } from "mongodb";
import type { OrganizationLegislation } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `organizationLegislation` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("organizationLegislation")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function organizationLegislationCollection<
  TSchema extends Document = OrganizationLegislation,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("organizationLegislation");
}
