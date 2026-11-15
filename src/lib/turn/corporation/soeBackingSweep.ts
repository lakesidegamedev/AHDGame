import type { Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { ActionAuditInput } from "@/lib/db/types/actionAuditLog";
import {
  processSoeOperations,
  foldSoeCashDeltas,
  buildSoeBackingAuditEntry,
} from "@/lib/nationalization/soeOperations";
import { processSoeRemittance } from "@/lib/nationalization/soeRemittance";
import {
  loadTreasuryCashContext,
  withTreasuryCashBatch,
} from "@/lib/nationalization/treasuryLedger";
import type { CorpSnapshot } from "./types";

export interface SoeBackingSweepArgs {
  db: Db;
  now: Date;
  /** Processing turn for treasury cash witnesses. Absent: the game clock. */
  turn?: number;
  currentYear?: number | null;
  corpSnapshots: CorpSnapshot[];
  corpById: Map<string, Corporation>;
  mark: (label: string) => void;
}

/* SOE loss backing then profit remittance, folding both cash legs into the
 * in-memory snapshots before history persistence. Remittance runs after
 * backing so it only acts on positive balance. Coverable basis is this
 * turn's realized income, with margin estimate as fallback. Both legs share
 * one treasury cash batch, flushed even if a later leg fails. Returns the
 * aggregate audit row, or null when neither leg moved anything. */
export async function runSoeBackingSweep(
  args: SoeBackingSweepArgs
): Promise<ActionAuditInput | null> {
  const realizedIncomeAnchorByCorpId = new Map(
    args.corpSnapshots.map((snap) => [snap.corpId.toString(), snap.income])
  );
  const context = await loadTreasuryCashContext(args.db, args.turn);
  const { soeBacking, soeRemitted } = await withTreasuryCashBatch(
    args.db,
    context,
    async (ledger) => {
      const { backing } = await processSoeOperations(
        args.db,
        args.now,
        args.currentYear,
        realizedIncomeAnchorByCorpId,
        ledger
      );
      args.mark("soeOperations");
      const { perCorp } = await processSoeRemittance(args.db, args.now, ledger);
      args.mark("soeRemittance");
      return { soeBacking: backing, soeRemitted: perCorp };
    }
  );

  // Fold both SOE cash legs into the in-memory snapshots/corp map BEFORE the
  // Phase 8 history persistence, so corporationHistory rows chart post-backing
  // cash (pre-fold they showed the stale pre-backing balance).
  foldSoeCashDeltas({
    corpSnapshots: args.corpSnapshots,
    corpById: args.corpById,
    backing: soeBacking,
    remittedLocalByCorpId: new Map(soeRemitted.map((r) => [r.corpId.toString(), r.amountLocal])),
  });
  return buildSoeBackingAuditEntry({
    backing: soeBacking,
    remittedCorps: soeRemitted.length,
  });
}
