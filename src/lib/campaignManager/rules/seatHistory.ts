/**
 * Seat history: every cycle of one seat, summarised for the race header's
 * arrows and the past-races list. Plain data in, plain data out.
 */

export type SeatCycleState = "upcoming" | "live" | "final";

export interface SeatPrimaryResult {
  candidateId: string;
  characterName: string;
  sharePct: number;
  won: boolean;
}

export interface SeatCycleInput {
  electionId: string;
  /** Exact race type, including snap variants, for cross-cycle navigation. */
  electionType?: string;
  cycle: number;
  year: number | null;
  /** Election status as stored. */
  status: string;
  candidates: Array<{ id: string; name: string; partyId: string }>;
  parties: Record<string, { name: string; abbr: string; color: string }>;
  /** The general's counted votes by candidate id (tally.totalVotes). */
  totalVotes: Record<string, number> | null;
  /** Each party's primary result (tally.primaryResults.byParty). */
  primaryResults: Record<string, SeatPrimaryResult[]> | null;
  /** Seats the race fills; above 1 it is a multi-seat race. */
  totalSeats?: number | null;
  /** Multi-seat races: seats each party won (or holds in the count), by party id. */
  seatsWon?: Record<string, number> | null;
}

export interface SeatCycle {
  electionId: string;
  /** Exact race type, including snap variants, for cross-cycle navigation. */
  electionType?: string;
  cycle: number;
  year: number | null;
  state: SeatCycleState;
  winner: { name: string; partyId: string; partyAbbr: string; partyColor: string } | null;
  /** Winner minus runner-up in percentage points, 1 dp; null without votes. */
  margin: number | null;
  /** Finished multi-seat races: seats won by party, most first. Null for single-seat races. */
  seatSplit: {
    total: number;
    parties: Array<{ partyId: string; partyAbbr: string; partyColor: string; seats: number }>;
  } | null;
  /** Finished primaries in this cycle. */
  primaries: Array<{
    partyId: string;
    partyAbbr: string;
    partyColor: string;
    winnerName: string;
    margin: number | null;
  }>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function cycleState(status: string): SeatCycleState {
  if (status === "completed" || status === "resolved") return "final";
  if (status === "upcoming") return "upcoming";
  return "live";
}

function generalResult(input: SeatCycleInput): Pick<SeatCycle, "winner" | "margin"> {
  const votes = input.totalVotes ?? {};
  const total = Object.values(votes).reduce((s, v) => s + v, 0);
  if (total <= 0) return { winner: null, margin: null };
  const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  const [topId, topVotes] = ranked[0];
  const runnerUp = ranked[1]?.[1] ?? 0;
  const cand = input.candidates.find((c) => c.id === topId);
  if (!cand) return { winner: null, margin: null };
  const party = input.parties[cand.partyId];
  return {
    winner: {
      name: cand.name,
      partyId: cand.partyId,
      partyAbbr: party?.abbr ?? "",
      partyColor: party?.color ?? "#888888",
    },
    margin: round1(((topVotes - runnerUp) / total) * 100),
  };
}

function primaryResults(input: SeatCycleInput): SeatCycle["primaries"] {
  const out: SeatCycle["primaries"] = [];
  for (const [partyId, rows] of Object.entries(input.primaryResults ?? {})) {
    const won = rows.find((r) => r.won);
    if (!won) continue;
    const next = rows
      .filter((r) => r !== won)
      .reduce<number | null>((m, r) => (m === null || r.sharePct > m ? r.sharePct : m), null);
    const party = input.parties[partyId];
    out.push({
      partyId,
      partyAbbr: party?.abbr ?? "",
      partyColor: party?.color ?? "#888888",
      winnerName: won.characterName,
      margin: next === null ? null : round1(won.sharePct - next),
    });
  }
  return out;
}

/** A multi-seat race's result is its seat split; it has no single winner. */
function seatSplit(input: SeatCycleInput): SeatCycle["seatSplit"] {
  const parties = Object.entries(input.seatsWon ?? {})
    .filter(([, seats]) => seats > 0)
    .map(([partyId, seats]) => ({
      partyId,
      partyAbbr: input.parties[partyId]?.abbr ?? "",
      partyColor: input.parties[partyId]?.color ?? "#888888",
      seats,
    }))
    .sort((a, b) => b.seats - a.seats);
  return parties.length > 0 ? { total: input.totalSeats ?? 0, parties } : null;
}

export function summarizeSeatCycle(input: SeatCycleInput): SeatCycle {
  const state = cycleState(input.status);
  const multiSeat = (input.totalSeats ?? 1) > 1;
  const result =
    state === "final" && !multiSeat ? generalResult(input) : { winner: null, margin: null };
  return {
    electionId: input.electionId,
    electionType: input.electionType,
    cycle: input.cycle,
    year: input.year,
    state,
    ...result,
    seatSplit: state === "final" && multiSeat ? seatSplit(input) : null,
    primaries: primaryResults(input),
  };
}

/** Newest cycle first. */
export function orderSeatCycles(cycles: SeatCycle[]): SeatCycle[] {
  return [...cycles].sort((a, b) => b.cycle - a.cycle);
}

/** The cycles either side of `electionId`, by cycle number. */
export function adjacentCycles(
  cycles: SeatCycle[],
  electionId: string
): { prev: SeatCycle | null; next: SeatCycle | null } {
  const ordered = orderSeatCycles(cycles);
  const i = ordered.findIndex((c) => c.electionId === electionId);
  if (i < 0) return { prev: null, next: null };
  return { prev: ordered[i + 1] ?? null, next: ordered[i - 1] ?? null };
}
