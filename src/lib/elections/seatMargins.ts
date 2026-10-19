/**
 * How many votes a candidate needs to gain their next projected seat, and how
 * many they can lose before dropping one.
 *
 * The answer comes from the projection itself: `project` is the same seat
 * estimate the race page shows (and the engine resolves with), and the margin
 * is the smallest whole-vote change that moves this candidate's seat count.
 * Nothing here re-derives a quota or divisor, so the number can never drift
 * from the allocation method the race actually uses.
 */

export interface SeatMargin {
  /** Extra votes for the next seat. Null when no reachable amount adds one. */
  toGain: number | null;
  /** Votes that can be lost before dropping a seat. Null when they hold none. */
  toLose: number | null;
}

export type SeatProjection = (votes: Record<string, number>) => Record<string, number> | null;

function seatsWith(
  project: SeatProjection,
  votes: Record<string, number>,
  id: string,
  delta: number
): number {
  const next = { ...votes, [id]: Math.max(0, (votes[id] ?? 0) + delta) };
  return project(next)?.[id] ?? 0;
}

/**
 * Smallest delta in [1, limit] for which `moved(delta)` holds, assuming it
 * stays true once reached. Null when even `limit` does not move it.
 */
function smallestMove(limit: number, moved: (delta: number) => boolean): number | null {
  if (limit < 1 || !moved(limit)) return null;
  let lo = 1;
  let hi = Math.floor(limit);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (moved(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function seatMarginFor(
  project: SeatProjection,
  votes: Record<string, number>,
  id: string
): SeatMargin {
  const current = project(votes)?.[id] ?? 0;
  const own = Math.max(0, votes[id] ?? 0);
  const field = Object.values(votes).reduce((a, v) => a + Math.max(0, v), 0);
  // Doubling the whole field is far past any seat threshold; a gain that
  // needs more than that is unreachable in practice.
  const gainLimit = Math.max(1, field * 2);
  const toGain = smallestMove(gainLimit, (d) => seatsWith(project, votes, id, d) > current);
  // `toLose` reports the cushion: the most votes they can shed and keep the
  // seat, i.e. one less than the smallest loss that drops it.
  const drop =
    current > 0 ? smallestMove(own, (d) => seatsWith(project, votes, id, -d) < current) : null;
  return { toGain, toLose: current > 0 ? (drop == null ? own : drop - 1) : null };
}

/** Margins for every candidate with votes. */
export function computeSeatMargins(
  project: SeatProjection,
  votes: Record<string, number>
): Record<string, SeatMargin> {
  const out: Record<string, SeatMargin> = {};
  for (const [id, v] of Object.entries(votes)) {
    if (v > 0) out[id] = seatMarginFor(project, votes, id);
  }
  return out;
}
