import type { Collection, Document } from "mongodb";
import type { OrganizationLeadershipElection } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `organizationLeadershipElections` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("organizationLeadershipElections")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function organizationLeadershipElectionsCollection<
  TSchema extends Document = OrganizationLeadershipElection,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("organizationLeadershipElections");
}
