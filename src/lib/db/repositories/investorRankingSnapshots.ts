import type { Collection, Document } from "mongodb";
import type { InvestorRankingSnapshot } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `investorRankingSnapshots` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("investorRankingSnapshots")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function investorRankingSnapshotsCollection<
  TSchema extends Document = InvestorRankingSnapshot,
>(db: CollectionSource): Collection<TSchema> {
  return db.collection<TSchema>("investorRankingSnapshots");
}
