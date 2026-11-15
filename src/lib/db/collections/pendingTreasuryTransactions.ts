import { getDb } from "@/lib/mongodb";
import type { PendingTreasuryTransaction } from "../types";

/**
 * Get the `pendingTreasuryTransactions` collection.
 *
 * Holds in-flight two-person-approval rows for Send to Member and
 * Transfer to State Party actions when a party's
 * `transactionApprovalMode === "double"`. See
 */
export async function getPendingTreasuryTransactionsCollection() {
  const db = await getDb();
  return db.collection<PendingTreasuryTransaction>("pendingTreasuryTransactions");
}
