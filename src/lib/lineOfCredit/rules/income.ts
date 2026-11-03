/** Tax payments reduce recurring-income underwriting; net losses cannot create credit. */
export function recurringIncomePerTurn(netIncome: number, observationTurns: number): number {
  return observationTurns > 0 ? Math.max(0, netIncome) / observationTurns : 0;
}

/** The parts of the world clock that bound an income window. */
export interface IncomeWindowClock {
  currentTurn?: number;
  economyReset?: { turn?: number; completedAt?: unknown } | null;
  stockHoldingTaxStartTurn?: number;
}

/**
 * Turn of the world's last economy reset, or null when it never had one.
 * Markers written before the reset recorded its turn fall back to the stock
 * holding tax anchor, which the reset restarts at its own turn.
 */
export function lastEconomyResetTurn(clock: IncomeWindowClock): number | null {
  const marker = clock.economyReset;
  if (!marker) return null;
  if (typeof marker.turn === "number" && Number.isFinite(marker.turn)) return marker.turn;
  if (marker.completedAt && typeof clock.stockHoldingTaxStartTurn === "number")
    return clock.stockHoldingTaxStartTurn;
  return null;
}

/**
 * The turns an income average reads: the last `averagingTurns` turns, never
 * reaching back to or past the last economy reset. Income paid by the old
 * economy must not underwrite credit in the new one, and the average divides
 * by the turns actually observed since the reset.
 */
export function incomeWindow(
  clock: IncomeWindowClock,
  averagingTurns: number
): { startTurn: number; endTurn: number; observationTurns: number } {
  const endTurn = Math.max(1, clock.currentTurn ?? 1);
  let startTurn = Math.max(1, endTurn - averagingTurns + 1);
  const resetTurn = lastEconomyResetTurn(clock);
  if (resetTurn !== null && resetTurn + 1 > startTurn) startTurn = resetTurn + 1;
  return { startTurn, endTurn, observationTurns: Math.max(0, endTurn - startTurn + 1) };
}
