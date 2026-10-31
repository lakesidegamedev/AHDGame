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
const PRUNABLE_MONEY_MOVE_KINDS: readonly string[] = Object.freeze([
  "manufacturing.product.advertising",
  "manufacturing.product.advertising.clearing",
  "corporate_operating_gross_receipt",
  "corporate_operating_loss",
  "corporate_operating_loss_batch",
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
 * Rows deleted per collection per run. A single deleteMany over a couple of
 * turns of ledgerEntries (~60k rows a turn) held the write path for ~20s, so
 * each run now deletes one small batch and the cron runs every minute: the
 * minute between runs is the pause. 5,000 ledger rows a minute drains a large
 * backlog in a day or two; money moves are ~23 KB each, so their batch is
 * smaller.
 */
const LEDGER_PRUNE_BATCH = 5_000;
const MONEY_MOVE_PRUNE_BATCH = 500;

export interface MoneyJournalPruneOptions {
  ledgerBatch?: number;
  moneyMoveBatch?: number;
}

export interface MoneyJournalPruneResult {
  skipped?: "turn-processing" | "no-game-state";
  cutoff: number;
  ledgerEntries: number;
  bankMoneyMoves: number;
}

function ledgerEntriesPruneFilter(cutoff: number): Document {
  return { turn: { $lt: cutoff } };
}

function bankMoneyMovesPruneFilter(cutoff: number): Document {
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

/**
 * Deletes one batch of the oldest prunable rows. Ids are read with an _id-only
 * projection, and the delete re-applies the filter so a row that changed since
 * the read is kept.
 */
async function deleteOldestBatch(
  db: Db,
  collection: "ledgerEntries" | "bankMoneyMoves",
  filter: Document,
  batch: number
): Promise<number> {
  const col = db.collection(collection);
  const rows = await col
    .find(filter, { projection: { _id: 1 } })
    .sort({ turn: 1 })
    .limit(batch)
    .toArray();
  if (rows.length === 0) return 0;
  const result = await col.deleteMany({ ...filter, _id: { $in: rows.map((row) => row._id) } });
  return result.deletedCount ?? 0;
}

/**
 * Delete one batch of money-journal rows older than
 * {@link MONEY_JOURNAL_RETENTION_TURNS} from each journal. Skips while a turn
 * holds the processing lock so it never competes with the turn for the
 * database. Runs every minute; each run is one short batch per collection.
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

  const bankMoneyMoves = await deleteOldestBatch(
    db,
    "bankMoneyMoves",
    bankMoneyMovesPruneFilter(cutoff),
    opts.moneyMoveBatch ?? MONEY_MOVE_PRUNE_BATCH
  );
  const ledgerEntries = await deleteOldestBatch(
    db,
    "ledgerEntries",
    ledgerEntriesPruneFilter(cutoff),
    opts.ledgerBatch ?? LEDGER_PRUNE_BATCH
  );
  return { cutoff, ledgerEntries, bankMoneyMoves };
}
