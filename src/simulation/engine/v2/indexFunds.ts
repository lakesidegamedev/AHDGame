import type { Db } from "mongodb";

import {
  runIndexFundCron,
  type FundCronResult,
  type IndexFundCronOptions,
} from "@/lib/indexFunds/fundCron";

/**
 * v2 `indexFunds`.
 *
 * Same cron, same passes, same money. The bid loop stops paying two reads it
 * already has in hand: the turn's transaction-log thresholds and cadence, which
 * `emitTx` loaded again for every bid although the cron read both at the top of
 * the run.
 *
 * The queued-redemption claim protocol (the largest remaining cost on a world
 * with a backlog) is untouched; see the engine changelog.
 */
export function runIndexFundCronV2(
  db: Db,
  options?: IndexFundCronOptions
): Promise<FundCronResult> {
  return runIndexFundCron(db, { ...options, reuseRebalanceReads: true });
}
