/**
 * Recent settled profit of one funded sector, for its valuation.
 *
 * Only turns the settlement actually paid out are recorded, so a turn where
 * the corporate step did not run leaves no entry rather than a zero. Entries
 * are keyed by the settled turn: recording the same turn twice replaces it.
 *
 * Pure: plain data in, plain data out.
 */

export interface SettledProfitEntry {
  turn: number;
  /** Anchor per turn. */
  profit: number;
}

/**
 * History after recording `profit` for `turn`, keeping the newest `window`
 * settled turns. Entries at or after `turn` are dropped first: a retried turn
 * replaces its own entry, and a world reset that restarts the turn count
 * cannot leave entries from the future in the window.
 */
export function recordSettledProfit(
  history: readonly SettledProfitEntry[] | undefined,
  turn: number,
  profit: number,
  window: number
): SettledProfitEntry[] {
  const keep = Math.max(1, Math.floor(window));
  const prior = (history ?? []).filter(
    (e) => Number.isFinite(e.turn) && Number.isFinite(e.profit) && e.turn < turn
  );
  prior.sort((a, b) => a.turn - b.turn);
  return [...prior, { turn, profit: Number.isFinite(profit) ? profit : 0 }].slice(-keep);
}

/** Mean profit per turn over the recorded settled turns, 0 when there are none. */
export function averageSettledProfit(history: readonly SettledProfitEntry[]): number {
  if (history.length === 0) return 0;
  return history.reduce((sum, e) => sum + e.profit, 0) / history.length;
}
