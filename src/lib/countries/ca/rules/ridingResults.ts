import { CAMPAIGN_BOOST_CAP } from "@/lib/redistricting/campaignBoost";
import {
  distributeSubdivisionVotes,
  assignSeatConsistentWinners,
  type SubdivisionInput,
  type SubdivisionVoteResult,
} from "@/lib/utils/subdivisionResults";

export interface CanadianRidingResult {
  version: 1;
  countryId: "CA";
  electionId: string;
  stateId: string;
  planVersion: "2023";
  viewBox: string;
  notice?: string;
  subdivisions: (SubdivisionVoteResult & { path: string })[];
  candidateNames: Record<string, string>;
  candidateParties: Record<string, string>;
  partyColors: Record<string, string>;
  seatsByCandidate: Record<string, number>;
}

/** Existing provincial quotas are authoritative; campaigns only change riding placement. */
export function projectCanadianRidings(input: {
  subdivisions: (SubdivisionInput & { path: string })[];
  votes: Record<string, number>;
  candidateParties: Record<string, string>;
  partyAbbreviations: Record<string, string>;
  seats: Record<string, number>;
  boosts?: Record<string, Record<string, number>>;
}): (SubdivisionVoteResult & { path: string })[] {
  const seats = Object.values(input.seats);
  if (
    seats.some((n) => !Number.isSafeInteger(n) || n < 0) ||
    seats.reduce((sum, n) => sum + n, 0) > input.subdivisions.length ||
    Object.entries(input.seats).some(([id, n]) => n > 0 && !Object.hasOwn(input.votes, id))
  )
    throw new Error("Canadian riding quotas do not match the provincial allocation");
  for (const byParty of Object.values(input.boosts ?? {})) {
    if (Object.values(byParty).some((n) => !Number.isFinite(n) || n < 0 || n > CAMPAIGN_BOOST_CAP))
      throw new Error("Invalid Canadian riding campaign boost");
  }
  const candidates = Object.fromEntries(
    Object.keys(input.votes).map((id) => [
      id,
      {
        baselineKey: input.partyAbbreviations[input.candidateParties[id]],
        econPosition: 0,
      },
    ])
  );
  const distributed = distributeSubdivisionVotes(input.subdivisions, input.votes, candidates);
  // Boost affects only the greedy placement score, never counted ballots or provincial quotas.
  const scores = Object.fromEntries(
    distributed.map((r) => {
      const total = Object.values(r.votes).reduce((sum, n) => sum + n, 0);
      const boosts = input.boosts?.[r.id.slice(-5)] ?? {};
      return [
        r.id,
        Object.fromEntries(
          Object.entries(r.votes).map(([id, votes]) => [
            id,
            (total > 0 ? votes / total : 0) + (boosts[input.candidateParties[id]] ?? 0) / 100,
          ])
        ),
      ];
    })
  );
  const placed = assignSeatConsistentWinners(distributed, input.seats, scores);
  const sources = new Map(input.subdivisions.map((r) => [r.id, r]));
  return placed.map((r, i) => ({
    ...distributed[i],
    winner: r.winner,
    // Margin is based on counted/projected ballots, not the campaign placement score.
    margin: (() => {
      const votes = distributed[i].votes;
      const total = Object.values(votes).reduce((sum, n) => sum + n, 0);
      const other = Math.max(
        0,
        ...Object.entries(votes)
          .filter(([id]) => id !== r.winner)
          .map(([, n]) => n)
      );
      return total > 0 && r.winner ? (((votes[r.winner] ?? 0) - other) * 100) / total : 0;
    })(),
    path: sources.get(r.id)!.path,
  }));
}
