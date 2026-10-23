import type { Db } from "mongodb";

import { processBankingTurn, type BankingTurnSummary } from "@/lib/turn/bankingTurn";

/**
 * v2 `bankingTurn`.
 *
 * Identical money movement, identical settlement journal, identical writes. It
 * hoists only the two reads that are uniform for the whole pass and were being
 * paid per bank:
 *
 *   - each deposit taker's financial sectors, for its deposit ceiling
 *     (one `$in` query instead of one query per bank);
 *   - the turn's transaction-log thresholds (one read instead of one per bank
 *     that pays deposit interest).
 *
 * Both are turn-level snapshots: neither can change inside a pass, so hoisting
 * them cannot reorder a transfer. The phase's dominant cost — the guarded
 * read-modify-write projections inside `settleTransition` — is deliberately
 * untouched; see the engine changelog for the measured split.
 */
export function processBankingTurnV2(db: Db, turn: number): Promise<BankingTurnSummary> {
  return processBankingTurn(db, turn, { batchPerBankReads: true });
}
