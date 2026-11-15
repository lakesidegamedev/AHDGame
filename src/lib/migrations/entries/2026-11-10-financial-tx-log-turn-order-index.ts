import type { Migration, MigrationResult } from "../types";
import { FINANCIAL_TX_LOG_TURN_ORDER_INDEX } from "@/lib/admin/seed/indexes/financialTxLog";
import { financialTxLogCollection } from "@/lib/db/repositories/financialTxLog";

/**
 * `financialTxLog` turn-order index on a live database.
 *
 * The ledger listing now sorts by turn, then write time, then `_id` (newest
 * first). Without a matching index Mongo would sort the whole filtered log in
 * memory on every page. Create-only and idempotent.
 */
export const migration: Migration = {
  id: "2026-11-10-financial-tx-log-turn-order-index",
  description: "Compound turn/createdAt/_id index for the financial ledger listing order.",
  idempotent: true,
  execute: async (db, ctx): Promise<MigrationResult> => {
    const { keys, options } = FINANCIAL_TX_LOG_TURN_ORDER_INDEX;
    const label = `financialTxLog.${options.name}`;
    if (ctx.dryRun)
      return { documentsScanned: 1, documentsUpdated: 0, notes: [`would create ${label}`] };
    await financialTxLogCollection(db).createIndex({ ...keys }, { ...options });
    return { documentsScanned: 1, documentsUpdated: 1, notes: [`created/verified ${label}`] };
  },
};
