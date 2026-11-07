import type { Db } from "mongodb";

import { processBankingTurn, type BankingTurnSummary } from "@/lib/turn/bankingTurn";

/**
 * v2 `bankingTurn`.
 *
 * Same money movement and settlement journal as v1, but hoists the two reads
 * that are uniform for the whole pass instead of paying per bank: each deposit
 * taker's financial sectors (one `$in` query) and the turn's transaction-log
 * thresholds. Both are turn-level snapshots that cannot change inside a pass,
 * so hoisting cannot reorder a transfer. The guarded read-modify-write
 * projections inside `settleTransition` are deliberately untouched.
 */
export function processBankingTurnV2(db: Db, turn: number): Promise<BankingTurnSummary> {
  return processBankingTurn(db, turn, { batchPerBankReads: true });
}
