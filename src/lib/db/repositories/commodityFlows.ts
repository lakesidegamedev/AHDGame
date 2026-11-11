import type { Collection, Document } from "mongodb";
import type { CommodityFlow } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `commodityFlows` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("commodityFlows")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function commodityFlowsCollection<TSchema extends Document = CommodityFlow>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("commodityFlows");
}
