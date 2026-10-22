/**
 * Bounded pruning of the two money journals that otherwise grow forever:
 * `ledgerEntries` (double-entry shadow ledger) and `bankMoneyMoves` (atomic
 * money-move records). Neither is covered by a TTL index or by
 * {@link RETENTION_POLICIES}, and together they add several MB per turn.
 *
 * Why plain deletes (no R2 archive): `ledgerEntries` is a shadow ledger. No
 * balance is derived from it; every reader is current-turn reconciliation, a
 * 48-turn turnover window, or an idempotent upsert that would rebuild an
 * identical row. `financialTxLog`, the forensic trail it mirrors, already
 * expires at the same 168-turn window.
 *
 * `bankMoneyMoves` doubles as the idempotency record for settlements, so only
 * terminal, fully projected moves of high-volume kinds whose keys embed the
 * turn or a one-off operation id are pruned. Kinds that carry live state on an
 * applied record (political media orders), act as one-off completion proofs
 * (savings migration), or are looked up by claim id without a turn bound
 * (sovereign payouts, guarantee claims, arrears) are never touched.
 */
import type { Db, Document } from "mongodb";
import { TX_TTL_TURNS } from "@/lib/db/types/financialTxLog";

/** Turns of money-journal history kept live, matching `financialTxLog`. */
export const MONEY_JOURNAL_RETENTION_TURNS = TX_TTL_TURNS;

/** Money-move kinds safe to prune once terminal and older than the window. */
export const PRUNABLE_MONEY_MOVE_KINDS: readonly string[] = Object.freeze([
  "manufacturing.product.advertising",
  "manufacturing.product.advertising.clearing",
  "corporate_operating_gross_receipt",
  "corporate_operating_loss",
  "corporate_operating_net_batch",
  "corporate_operating_net_receipt",
  "corporate_tax_withholding",
  "npc_loan_service",
  "npc_book_settlement",
  "npc_deposit_flow",
  "loan_service",
  "insurance_premium",
  "organization_dues",
  "fund_float_buy",
  "fund_float_sell",
  "fund_queued_redemption",
  "fund_queued_redemption_batch",
]);

/**
 * Turns of backlog one run may clear per collection. Runs fire six times an
 * hour, so a long-lived world drains its backlog several times faster than
 * hourly (or half-hourly) turns add to it, while each delete stays bounded to
 * a couple of turns of rows.
 */
export const MONEY_JOURNAL_PRUNE_TURNS_PER_RUN = 2;

export interface MoneyJournalPruneResult {
  skipped?: "turn-processing" | "no-game-state";
  cutoff: number;
  ledgerEntries: number;
  bankMoneyMoves: number;
}

export function ledgerEntriesPruneFilter(cutoff: number): Document {
  return { turn: { $lt: cutoff } };
}

export function bankMoneyMovesPruneFilter(cutoff: number): Document {
  return {
    turn: { $lt: cutoff },
    kind: { $in: [...PRUNABLE_MONEY_MOVE_KINDS] },
    status: { $in: ["applied", "rejected"] },
    treasuryReserveRecoveryPending: { $ne: true },
    // Keep legacy records whose projections never completed: recovery
    // (`unfinishedSettlementFilter`) still resumes them.
    $or: [{ "projections.0": { $exists: false } }, { projectionsCompletedAt: { $exists: true } }],
  };
}

/**
 * One bounded delete: from the oldest prunable turn up to `turnsPerRun` turns
 * later, never past the retention cutoff.
 */
async function deleteOldestTurns(
  db: Db,
  collection: "ledgerEntries" | "bankMoneyMoves",
  filter: Document,
  cutoff: number,
  turnsPerRun: number
): Promise<number> {
  const col = db.collection(collection);
  const oldest = await col.findOne(filter, { sort: { turn: 1 }, projection: { turn: 1 } });
  if (typeof oldest?.turn !== "number") return 0;
  const upper = Math.min(cutoff, oldest.turn + turnsPerRun);
  const result = await col.deleteMany({ ...filter, turn: { $lt: upper } });
  return result.deletedCount ?? 0;
}

/**
 * Delete money-journal rows older than {@link MONEY_JOURNAL_RETENTION_TURNS}.
 * Skips while a turn holds the processing lock so it never competes with the
 * turn for the database. Each run clears at most `turnsPerRun` turns of
 * backlog per collection; later runs pick up the rest.
 */
export async function pruneMoneyJournals(
  db: Db,
  opts: { turnsPerRun?: number } = {}
): Promise<MoneyJournalPruneResult> {
  const state = await db
    .collection<{ _id: string; currentTurn?: number; isProcessing?: boolean }>("gameState")
    .findOne({ _id: "current" }, { projection: { currentTurn: 1, isProcessing: 1 } });
  const currentTurn = state?.currentTurn;
  if (typeof currentTurn !== "number" || !Number.isFinite(currentTurn)) {
    return { skipped: "no-game-state", cutoff: 0, ledgerEntries: 0, bankMoneyMoves: 0 };
  }
  const cutoff = currentTurn - MONEY_JOURNAL_RETENTION_TURNS;
  if (state?.isProcessing) {
    return { skipped: "turn-processing", cutoff, ledgerEntries: 0, bankMoneyMoves: 0 };
  }
  if (cutoff <= 0) return { cutoff, ledgerEntries: 0, bankMoneyMoves: 0 };

  const turnsPerRun = opts.turnsPerRun ?? MONEY_JOURNAL_PRUNE_TURNS_PER_RUN;
  const bankMoneyMoves = await deleteOldestTurns(
    db,
    "bankMoneyMoves",
    bankMoneyMovesPruneFilter(cutoff),
    cutoff,
    turnsPerRun
  );
  const ledgerEntries = await deleteOldestTurns(
    db,
    "ledgerEntries",
    ledgerEntriesPruneFilter(cutoff),
    cutoff,
    turnsPerRun
  );
  return { cutoff, ledgerEntries, bankMoneyMoves };
}
