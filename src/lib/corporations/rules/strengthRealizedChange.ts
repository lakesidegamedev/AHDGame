export interface StrengthHistoryRow {
  turn: number;
  marketingStrength?: number;
  logisticsStrength?: number;
  rdScore?: number;
}

export interface StrengthRealizedChange {
  /** Turn whose settled snapshot carries the newer value. */
  turn: number;
  marketing: number | null;
  logistics: number | null;
  rd: number | null;
}

function diff(newer: number | undefined, older: number | undefined): number | null {
  if (typeof newer !== "number" || typeof older !== "number") return null;
  if (!Number.isFinite(newer) || !Number.isFinite(older)) return null;
  return Math.round((newer - older) * 1000) / 1000;
}

/**
 * What marketing, logistics and R&D actually moved last turn, from the two
 * newest settled history rows (newest first). Null without two rows.
 */
export function lastTurnStrengthChange(
  rowsNewestFirst: readonly StrengthHistoryRow[]
): StrengthRealizedChange | null {
  const [newer, older] = rowsNewestFirst;
  if (!newer || !older) return null;
  return {
    turn: newer.turn,
    marketing: diff(newer.marketingStrength, older.marketingStrength),
    logistics: diff(newer.logisticsStrength, older.logisticsStrength),
    rd: diff(newer.rdScore, older.rdScore),
  };
}
