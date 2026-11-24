/**
 * Committee proposal votes count only while the voter still holds a seat that
 * may vote. A member who leaves the committee or office before resolution
 * keeps no say, and the threshold is computed on the same eligible set.
 */

export interface StoredVote {
  voterId: { toString(): string };
  vote: "yes" | "no";
}

export interface EligibleVoteCount {
  yes: number;
  no: number;
  /** Eligible voters who have not voted. */
  notVoted: number;
  /** Size of the eligible voter set. */
  eligible: number;
}

export function countEligibleVotes(
  votes: readonly StoredVote[],
  eligibleVoterIds: ReadonlySet<string>
): EligibleVoteCount {
  const counted = new Set<string>();
  let yes = 0;
  let no = 0;
  for (const v of votes) {
    const id = v.voterId.toString();
    if (!eligibleVoterIds.has(id) || counted.has(id)) continue;
    counted.add(id);
    if (v.vote === "yes") yes += 1;
    else no += 1;
  }
  return { yes, no, notVoted: eligibleVoterIds.size - yes - no, eligible: eligibleVoterIds.size };
}
