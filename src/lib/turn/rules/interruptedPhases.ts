/**
 * Which turn steps may be skipped when a process death left them mid-flight.
 *
 * Fail closed: a step counts as money-moving unless it is on this list, so a
 * new step is never resumable by default. Add a step only when skipping its
 * remaining work for one turn moves no money or holdings and the next turn
 * repairs or continues it.
 */
export const SAFE_WHEN_INTERRUPTED: Readonly<Record<string, string>> = {
  financialSuspectScan: "read-only scan that writes findings",
  activityLogging: "writes the activity feed only",
  auditAnomalyScan: "read-only scan that writes findings",
  suspiciousDetection: "read-only scan that writes findings",
  gameHealthSnapshot: "health snapshot, rebuilt next turn",
  ledgerPreForexSnapshot: "ledger snapshot, no balances change",
  ledgerBalanceSnapshot: "ledger snapshot, no balances change",
  ledgerReconcile: "reports drift, no balances change",
  metricHistory: "history rows only",
  approvalSnapshot: "history rows only",
  interestRateSnapshot: "history rows only",
  partyHistorySnapshot: "history rows only",
  researchTelemetry: "telemetry only",
  portfolioSnapshot: "snapshot rows only",
  corpPortfolioSnapshot: "snapshot rows only",
  stockExchangeSnapshot: "snapshot rows only",
  investorRankingSnapshot: "ranking snapshot, rebuilt next turn",
  wealthListSnapshot: "ranking snapshot, rebuilt next turn",
  moneySupplySnapshot: "snapshot of money supply, no balances change",
  turnoutDecay: "decays a turnout counter; next turn continues it",
  regDriftDecay: "decays a registration drift counter; next turn continues it",
  pressureDecay: "decays a pressure counter; next turn continues it",
  priorityRegionDecay: "decays a priority counter; next turn continues it",
  supportDecay: "decays a support counter; next turn continues it",
  bucketApprovalDecay: "decays an approval counter; next turn continues it",
  metricDecay: "decays a metric toward baseline; next turn continues it",
  investorConfidenceDecay: "decays a confidence counter; next turn continues it",
};

/**
 * Steps proven safe to RERUN after a process death, under turn resilience stage 2:
 * each applies its money moves behind a per-turn guard written in the same update
 * as the move, so running it again for the same turn changes nothing already
 * applied. An interrupted step on this list is rerun on resume instead of held.
 * A step belongs here only with a test that kills it at every write boundary and
 * reruns it to the uninterrupted end state; new steps are never on it by default.
 */
/** Turn resilience stage from which the stamped, rerun-safe write paths run and steps are rerun. */
export const RERUN_SAFE_STAGE = 2;

export const RERUN_SAFE_WHEN_INTERRUPTED: Readonly<Record<string, string>> = {
  treasuryTurn:
    "accrual is one guarded claim per budget and turn, coupon payouts replay by receipt; killed at every write and rerun it matches an uninterrupted turn",
  savingsInterestTurn:
    "per-account accrual stamped with the turn in the same update, the quarterly credit is one receipted transaction; killed at every write and rerun the balances match an uninterrupted turn (forex path; diagnostic ledger rows and counters can come up short, never doubled)",
  pensionTurn:
    "employer debits carry a per-agreement per-turn stamp, each charge, benefit payment and fund investment is stamped on the scheme, fund-side writes finish forward behind per-turn witnesses; killed at every write and rerun it matches an uninterrupted turn (ledger rows can come up short, never doubled)",
};

export function isRerunSafeWhenInterrupted(phase: string): boolean {
  return Object.prototype.hasOwnProperty.call(RERUN_SAFE_WHEN_INTERRUPTED, phase);
}

export function isSafeWhenInterrupted(phase: string): boolean {
  return Object.prototype.hasOwnProperty.call(SAFE_WHEN_INTERRUPTED, phase);
}

export type InterruptedClassification = {
  /** Interrupted steps that may be skipped. */
  safe: string[];
  /** Interrupted steps that may have moved money or holdings (everything not on the list). */
  moneyMoving: string[];
};

export function classifyInterruptedPhases(
  interrupted: Iterable<string>
): InterruptedClassification {
  const safe: string[] = [];
  const moneyMoving: string[] = [];
  for (const phase of interrupted) (isSafeWhenInterrupted(phase) ? safe : moneyMoving).push(phase);
  return { safe: safe.sort(), moneyMoving: moneyMoving.sort() };
}
