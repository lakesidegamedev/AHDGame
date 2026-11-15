import type { Collection, Document } from "mongodb";
import type { OrganizationMembershipProposal } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `organizationMembershipProposals` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("organizationMembershipProposals")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function organizationMembershipProposalsCollection<
  TSchema extends Document = OrganizationMembershipProposal,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("organizationMembershipProposals");
}
