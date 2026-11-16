import { hemicycleLayout } from "@/lib/charts/seatingLayouts";

/** One party's line in a chamber-wide result. Plain data, safe to serialise. */
export interface ChamberPartyInput {
  partyId: string;
  name: string;
  abbreviation: string;
  color: string;
  seats: number;
  votes: number;
}

export interface ChamberPartyRow extends ChamberPartyInput {
  /** Share of all votes cast, 0 to 100. Null when no votes were recorded. */
  votePct: number | null;
  /** Seats minus the previous election's seats. Null with no previous election. */
  seatChange: number | null;
  /** Change in vote share, in percentage points. Null with no previous election. */
  swing: number | null;
}

export interface ArcSeat {
  x: number;
  y: number;
  r: number;
  color: string;
  partyId: string | null;
}

export const VACANT_SEAT_COLOR = "#4B5563";

export function sumValues(values: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(values)) total += v;
  return total;
}

export function votePercent(votes: number, totalVotes: number): number | null {
  return totalVotes > 0 ? (votes / totalVotes) * 100 : null;
}

export function seatChange(current: number, previous: number | undefined | null): number | null {
  return previous == null ? null : current - previous;
}

/** Percentage-point change in vote share. Null if either share is unknown. */
export function swingPoints(current: number | null, previous: number | null): number | null {
  return current == null || previous == null ? null : current - previous;
}

/** Seats needed for a majority of the whole chamber. */
export function majoritySeats(totalSeats: number): number {
  return Math.floor(totalSeats / 2) + 1;
}

/**
 * Joins this election's parties to the previous election's by id. A party with
 * no previous line counts as zero seats, unless there was no previous election
 * at all, in which case every change is unknown.
 */
export function buildPartyRows(
  current: ChamberPartyInput[],
  previous: ChamberPartyInput[] | null
): ChamberPartyRow[] {
  const totalVotes = current.reduce((sum, p) => sum + p.votes, 0);
  const prevTotalVotes = previous?.reduce((sum, p) => sum + p.votes, 0) ?? 0;
  const prevById = new Map((previous ?? []).map((p) => [p.partyId, p]));

  const rows = current.map((party): ChamberPartyRow => {
    const votePct = votePercent(party.votes, totalVotes);
    if (!previous) return { ...party, votePct, seatChange: null, swing: null };
    const prev = prevById.get(party.partyId);
    const prevPct = prevTotalVotes > 0 ? votePercent(prev?.votes ?? 0, prevTotalVotes) : null;
    return {
      ...party,
      votePct,
      seatChange: seatChange(party.seats, prev?.seats ?? 0),
      swing: swingPoints(votePct, prevPct),
    };
  });
  return rows.sort(
    (a, b) => b.seats - a.seats || b.votes - a.votes || a.name.localeCompare(b.name)
  );
}

/**
 * Seat dots for a hemicycle, one per seat, coloured by party. Seats are sorted
 * by angle so each party fills a wedge from left to right; any seats not held
 * by a listed party are drawn as vacant.
 */
export function arcSeats(
  parties: Pick<ChamberPartyInput, "partyId" | "color" | "seats">[],
  totalSeats: number
): { seats: ArcSeat[]; seatRadius: number } {
  const { pts, seatR } = hemicycleLayout(totalSeats);
  const ordered = [...pts].sort((a, b) => {
    const angleA = Math.atan2(-a.y, a.x);
    const angleB = Math.atan2(-b.y, b.x);
    return angleB - angleA || Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y);
  });

  const owners: Array<{ partyId: string | null; color: string }> = [];
  for (const party of parties) {
    for (let i = 0; i < Math.max(0, Math.floor(party.seats)); i++) {
      owners.push({ partyId: party.partyId, color: party.color });
    }
  }

  const seats = ordered.map((pt, i): ArcSeat => {
    const owner = owners[i];
    return {
      x: pt.x,
      y: pt.y,
      r: seatR,
      color: owner?.color ?? VACANT_SEAT_COLOR,
      partyId: owner?.partyId ?? null,
    };
  });
  return { seats, seatRadius: seatR };
}

export function formatSignedInt(n: number | null): string {
  if (n == null) return "";
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : `${n}`;
}

export function formatSwing(n: number | null): string {
  if (n == null) return "";
  const rounded = Math.round(n * 10) / 10;
  if (rounded === 0) return "0.0";
  return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1);
}
