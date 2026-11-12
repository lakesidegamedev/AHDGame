import type { Collection, Document } from "mongodb";
import type { CampaignFieldOffice } from "../types/campaignFieldOffice";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `campaignFieldOffices` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("campaignFieldOffices")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function campaignFieldOfficesCollection<TSchema extends Document = CampaignFieldOffice>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("campaignFieldOffices");
}
