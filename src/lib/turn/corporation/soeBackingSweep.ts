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
import { withTurnValueSettlement } from "@/lib/turn/withTurnValueSettlement";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

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

/** Settle SOE effects and both treasury legs before publishing cash snapshots. */
export async function runSoeBackingSweep(
  args: SoeBackingSweepArgs
): Promise<ActionAuditInput | null> {
  const realizedIncomeAnchorByCorpId = new Map(
    args.corpSnapshots.map((snap) => [snap.corpId.toString(), snap.income])
  );
  const turn =
    args.turn ??
    (
      await gameStateCollection(args.db).findOne(
        { _id: "current" },
        { projection: { currentTurn: 1 } }
      )
    )?.currentTurn;
  if (turn === undefined) throw new Error("SOE sweep requires a processing turn");
  const { soeBacking, soeRemitted } = await withTurnValueSettlement(
    args.db,
    "soe-backing-remittance",
    turn,
    async (db) => {
      const context = await loadTreasuryCashContext(db, turn);
      return withTreasuryCashBatch(db, context, async (ledger) => {
        const { backing } = await processSoeOperations(
          db,
          args.now,
          args.currentYear,
          realizedIncomeAnchorByCorpId,
          ledger
        );
        const { perCorp } = await processSoeRemittance(
          db,
          args.now,
          ledger,
          realizedIncomeAnchorByCorpId
        );
        return { soeBacking: backing, soeRemitted: perCorp };
      });
    }
  );
  args.mark("soeOperations");
  args.mark("soeRemittance");
  const affectedIds = [
    ...new Map([
      ...soeBacking.map((row) => [row.corpId.toString(), row.corpId] as const),
      ...soeRemitted.map((row) => [row.corpId.toString(), row.corpId] as const),
    ]).values(),
  ];
  const cashRows = affectedIds.length
    ? await corporationsCollection(args.db)
        .find({ _id: { $in: affectedIds } }, { projection: { liquidCapital: 1 } })
        .toArray()
    : [];
  const authoritativeCash = new Map(cashRows.map((row) => [row._id.toString(), row.liquidCapital]));
  if (affectedIds.some((id) => !Number.isFinite(authoritativeCash.get(id.toString()))))
    throw new Error("SOE cash snapshot requires a reconciled corporation balance");

  // A resumed sweep reads the settled balance instead of adding its receipt again.
  foldSoeCashDeltas({
    corpSnapshots: args.corpSnapshots,
    corpById: args.corpById,
    backing: soeBacking,
    authoritativeCash,
    remittedLocalByCorpId: new Map(soeRemitted.map((r) => [r.corpId.toString(), r.amountLocal])),
  });
  return buildSoeBackingAuditEntry({
    backing: soeBacking,
    remittedCorps: soeRemitted.length,
  });
}
