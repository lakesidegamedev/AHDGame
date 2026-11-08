/**
 * Bloc-list seat allocation (National Front model). The party split is a
 * negotiated quota from `@/lib/constants/blocList`, not an election outcome;
 * the vote only divides each party's own slate. This keeps the split immune
 * to candidate positioning while leaving the intra-party contest meaningful.
 * A candidate holds a block of seats, so both stages are largest-remainder
 * splits that conserve their total exactly. Pure and deterministic.
 */

import type { RankedCandidate } from "./seatAllocation";

/**
 * Largest-remainder split of `total` across weighted keys. Exact-sum: the
 * returned counts always sum to `total` when `total > 0` and some weight is
 * positive. Shared by both stages.
 */
function largestRemainder(total: number, weights: ReadonlyArray<{ key: string; weight: number }>) {
  const out = new Map<string, number>();
  const positive = weights.filter((w) => Number.isFinite(w.weight) && w.weight > 0);
  if (total <= 0 || positive.length === 0) {
    // Degenerate: no usable weights. Spread evenly so seats are never lost.
    if (total > 0 && weights.length > 0) {
      for (let i = 0; i < total; i++) {
        const k = weights[i % weights.length].key;
        out.set(k, (out.get(k) ?? 0) + 1);
      }
    }
    return out;
  }

  const totalWeight = positive.reduce((s, x) => s + x.weight, 0);
  const raw = positive.map((x) => {
    const exact = (x.weight / totalWeight) * total;
    return { key: x.key, seats: Math.floor(exact), remainder: exact % 1 };
  });
  let assigned = raw.reduce((s, r) => s + r.seats, 0);
  // Stable ordering: largest fractional part first, key as the tiebreak, so the
  // same inputs always produce the same chamber.
  raw.sort((a, b) => b.remainder - a.remainder || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (let i = 0; assigned < total; i++, assigned++) raw[i % raw.length].seats++;
  for (const r of raw) if (r.seats > 0) out.set(r.key, r.seats);
  return out;
}

/**
 * Allocate `totalSeats` by bloc-list quota.
 *
 * @param totalSeats  seats in this race
 * @param quotaShares party sequentialId (string) to quota weight; normalised
 * @param ranked      candidates, highest votes first
 * @returns candidateId to seat count, covering every candidate in `ranked`
 *
 * Parties absent from the quota receive 0 seats: an unsanctioned party cannot
 * appear on the National Front list. Their candidates are returned with 0
 * rather than omitted so callers can present a complete result.
 *
 * A quota party that fielded nobody has its share redistributed across the
 * parties that did, in proportion to their quotas.
 */
export function allocateBlocListSeats(
  totalSeats: number,
  quotaShares: Readonly<Record<string, number>>,
  ranked: ReadonlyArray<RankedCandidate>
): Record<string, number> {
  const seats: Record<string, number> = {};
  for (const c of ranked) seats[c.id] = 0;
  if (totalSeats <= 0 || ranked.length === 0) return seats;

  // Group the sanctioned candidates by party, preserving vote-descending order.
  const byParty = new Map<string, RankedCandidate[]>();
  for (const c of ranked) {
    const party = c.party;
    if (!party) continue;
    const weight = quotaShares[party];
    if (!Number.isFinite(weight) || weight <= 0) continue;
    byParty.set(party, [...(byParty.get(party) ?? []), c]);
  }
  // No sanctioned candidate stood: nobody is seated. The caller decides whether
  // that is a failed list; this function does not invent a winner.
  if (byParty.size === 0) return seats;

  // Stage 1: the quota, over the parties that actually fielded a slate.
  const perParty = largestRemainder(
    totalSeats,
    [...byParty.keys()].map((party) => ({ key: party, weight: quotaShares[party] }))
  );

  // Stage 2: each party's block, over its own candidates by vote.
  for (const [party, blockSeats] of perParty) {
    const cands = byParty.get(party) ?? [];
    if (cands.length === 0 || blockSeats <= 0) continue;
    if (cands.length === 1) {
      seats[cands[0].id] = blockSeats;
      continue;
    }
    const within = largestRemainder(
      blockSeats,
      cands.map((c) => ({ key: c.id, weight: Math.max(0, c.votes) }))
    );
    for (const [id, n] of within) seats[id] = n;
  }
  return seats;
}
