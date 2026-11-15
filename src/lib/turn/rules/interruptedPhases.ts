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
