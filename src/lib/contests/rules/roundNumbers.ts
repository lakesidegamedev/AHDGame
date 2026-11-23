/**
 * Weekly contests that open together share one round number. Rounds stored
 * before the shared counter can lag the rest of their opening day.
 */
export interface RoundNumberRow {
  id: string;
  kind: string;
  roundNumber: number;
  startedAtMs: number;
}

export interface RoundNumberFix {
  id: string;
  from: number;
  to: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function alignRoundNumbers(
  rows: readonly RoundNumberRow[],
  skipKinds: readonly string[]
): RoundNumberFix[] {
  const dayOf = (r: RoundNumberRow) => Math.floor(r.startedAtMs / DAY_MS);
  const top = new Map<number, number>();
  for (const r of rows) {
    if (skipKinds.includes(r.kind)) continue;
    top.set(dayOf(r), Math.max(top.get(dayOf(r)) ?? 0, r.roundNumber));
  }
  const fixes: RoundNumberFix[] = [];
  for (const r of rows) {
    if (skipKinds.includes(r.kind)) continue;
    const to = top.get(dayOf(r)) ?? r.roundNumber;
    if (to > r.roundNumber) fixes.push({ id: r.id, from: r.roundNumber, to });
  }
  return fixes;
}
