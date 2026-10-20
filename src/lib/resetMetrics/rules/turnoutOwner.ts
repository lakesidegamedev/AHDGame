/** Completed ballots update turnout once; concurrent offices never add the same voters twice. */
export interface TurnoutReceipt {
  regionId: string;
  turn: number;
  ballots: number;
  eligible: number;
  key: string;
}

export function latestTurnoutReceipts(
  rows: readonly TurnoutReceipt[],
  turn: number
): Map<string, TurnoutReceipt> {
  const out = new Map<string, TurnoutReceipt>();
  for (const row of rows) {
    if (
      !Number.isSafeInteger(row.turn) ||
      row.turn < 1 ||
      row.turn > turn ||
      !Number.isFinite(row.ballots) ||
      row.ballots <= 0 ||
      !Number.isFinite(row.eligible) ||
      row.eligible <= 0 ||
      row.ballots > row.eligible
    )
      continue;
    const prior = out.get(row.regionId);
    if (!prior || row.turn > prior.turn || (row.turn === prior.turn && row.key < prior.key))
      out.set(row.regionId, row);
  }
  return out;
}
