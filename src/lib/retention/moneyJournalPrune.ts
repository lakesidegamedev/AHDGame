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
 * Batch shape. A single deleteMany over a couple of turns of ledgerEntries
 * (~60k rows a turn) held the primary's write path for ~20s, so deletes go out
 * in small _id batches with a pause between them, and each run stops at a row
 * cap and a time cap. Six runs an hour at these caps drain a large backlog in
 * a day or two while each batch stays short.
 */
export const MONEY_JOURNAL_PRUNE_BATCH = 2_000;
export const MONEY_JOURNAL_PRUNE_PAUSE_MS = 150;
export const MONEY_JOURNAL_PRUNE_MAX_ROWS_PER_RUN = 50_000;
export const MONEY_JOURNAL_PRUNE_MAX_MS_PER_RUN = 60_000;

export interface MoneyJournalPruneOptions {
  batchSize?: number;
  pauseMs?: number;
  /** Rows per collection per run. */
  maxRowsPerRun?: number;
  /** Wall time for the whole run, both collections. */
  maxMsPerRun?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface MoneyJournalPruneResult {
  skipped?: "turn-processing" | "no-game-state";
  /** Set when the run stopped early: a turn took the lock, or a cap was reached. */
  stoppedBy?: "turn-started" | "row-cap" | "time-cap";
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

type GameStateLock = { _id: string; currentTurn?: number; isProcessing?: boolean };

async function turnIsProcessing(db: Db): Promise<boolean> {
  const state = await db
    .collection<GameStateLock>("gameState")
    .findOne({ _id: "current" }, { projection: { isProcessing: 1 } });
  return state?.isProcessing === true;
}

/**
 * Deletes the oldest prunable rows in small _id batches. Re-checks the turn
 * lock before every batch, and stops at the row or time cap; later runs carry
 * on from the oldest remaining turn.
 */
async function deleteInBatches(
  db: Db,
  collection: "ledgerEntries" | "bankMoneyMoves",
  filter: Document,
  limits: Required<
    Pick<MoneyJournalPruneOptions, "batchSize" | "pauseMs" | "maxRowsPerRun" | "sleep" | "now">
  > & {
    deadline: number;
  }
): Promise<{ deleted: number; stoppedBy?: MoneyJournalPruneResult["stoppedBy"] }> {
  const col = db.collection(collection);
  let deleted = 0;
  for (;;) {
    if (deleted >= limits.maxRowsPerRun) return { deleted, stoppedBy: "row-cap" };
    if (limits.now() >= limits.deadline) return { deleted, stoppedBy: "time-cap" };
    if (await turnIsProcessing(db)) return { deleted, stoppedBy: "turn-started" };
    const size = Math.min(limits.batchSize, limits.maxRowsPerRun - deleted);
    const rows = await col
      .find(filter, { projection: { _id: 1 } })
      .sort({ turn: 1 })
      .limit(size)
      .toArray();
    const ids = rows.map((row) => row._id);
    if (ids.length === 0) return { deleted };
    // The filter is re-applied so a row that changed since the read is kept.
    const result = await col.deleteMany({ ...filter, _id: { $in: ids } });
    deleted += result.deletedCount ?? 0;
    if (ids.length < size) return { deleted };
    if (deleted >= limits.maxRowsPerRun) return { deleted, stoppedBy: "row-cap" };
    await limits.sleep(limits.pauseMs);
  }
}

/**
 * Delete money-journal rows older than {@link MONEY_JOURNAL_RETENTION_TURNS}.
 * Skips while a turn holds the processing lock and stops as soon as one takes
 * it, so it never competes with the turn for the database. Deletes go out in
 * small batches under a per-run row and time cap; later runs pick up the rest.
 */
export async function pruneMoneyJournals(
  db: Db,
  opts: MoneyJournalPruneOptions = {}
): Promise<MoneyJournalPruneResult> {
  const state = await db
    .collection<GameStateLock>("gameState")
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

  const now = opts.now ?? Date.now;
  const limits = {
    batchSize: opts.batchSize ?? MONEY_JOURNAL_PRUNE_BATCH,
    pauseMs: opts.pauseMs ?? MONEY_JOURNAL_PRUNE_PAUSE_MS,
    maxRowsPerRun: opts.maxRowsPerRun ?? MONEY_JOURNAL_PRUNE_MAX_ROWS_PER_RUN,
    sleep: opts.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms))),
    now,
    deadline: now() + (opts.maxMsPerRun ?? MONEY_JOURNAL_PRUNE_MAX_MS_PER_RUN),
  };
  const moves = await deleteInBatches(
    db,
    "bankMoneyMoves",
    bankMoneyMovesPruneFilter(cutoff),
    limits
  );
  if (moves.stoppedBy === "turn-started" || moves.stoppedBy === "time-cap") {
    return { cutoff, ledgerEntries: 0, bankMoneyMoves: moves.deleted, stoppedBy: moves.stoppedBy };
  }
  const ledger = await deleteInBatches(
    db,
    "ledgerEntries",
    ledgerEntriesPruneFilter(cutoff),
    limits
  );
  return {
    cutoff,
    ledgerEntries: ledger.deleted,
    bankMoneyMoves: moves.deleted,
    ...(ledger.stoppedBy || moves.stoppedBy
      ? { stoppedBy: ledger.stoppedBy ?? moves.stoppedBy }
      : {}),
  };
}
