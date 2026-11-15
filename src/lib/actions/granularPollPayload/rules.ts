/**
 * Candidate approval in granular polls. Bucket approval modifies appeal through
 * the election engine's favorability calculation; see applyCandidateApprovalWeight.
 */
import { calcEffectiveFavorability } from "@/lib/elections/engine/voteCalculations";
import { approvalScalar, calcAppeal, MAX_APPEAL } from "@/lib/utils/demographicAppeal";
import { normalizeNPI } from "@/lib/utils/normalizeNPI";
import { applyVoteReachFloor } from "@/lib/elections/engine/electionFormulaFactors";

/** Apply the vote engine's effective-favorability and approval kernels to a cell. */
function applyCandidateApprovalWeight(
  appeal: number,
  favorability: number | undefined,
  approvalBuckets: Record<string, number>,
  cellBuckets: Record<string, string>
): number {
  const bucketApproval = Object.entries(cellBuckets).reduce(
    (sum, [dimension, bucket]) => sum + (approvalBuckets[`${dimension}:${bucket}`] ?? 0),
    0
  );
  const effectiveFavorability = calcEffectiveFavorability(favorability ?? 50, bucketApproval);
  return appeal * approvalScalar(effectiveFavorability);
}

/** Apply the tally's tenure-adjusted approval and reach to a poll cell. */
export function applyCandidatePersonalVoteWeight(
  appeal: number,
  favorability: number | undefined,
  influence: number | undefined,
  tenureRetention: number,
  approvalBuckets: Record<string, number>,
  cellBuckets: Record<string, string>
): number {
  return (
    applyCandidateApprovalWeight(
      appeal,
      Math.max(0, (favorability ?? 50) * tenureRetention),
      approvalBuckets,
      cellBuckets
    ) * applyVoteReachFloor(normalizeNPI(Math.max(0, (influence ?? 0) * tenureRetention)))
  );
}

export interface PollHeadlineCandidate {
  economicPosition: number;
  socialPosition: number;
  favorability?: number;
  politicalInfluence: number;
  /** Bucket approval modifiers keyed "dim:bucket". */
  approvalBuckets: Record<string, number>;
}

export interface PollHeadlineCell {
  share: number;
  turnout: number;
  economicLean: number;
  socialLean: number;
  buckets: Record<string, string>;
}

export interface PollHeadline {
  overallAppeal: number;
  totalEstimatedVoters: number;
  totalPotentialVoters: number;
}

/** Expected voters in one cell: electorate share times turnout percent. */
function cellVoters(cell: PollHeadlineCell, statePopulation: number): number {
  return statePopulation * cell.share * (cell.turnout / 100);
}

/**
 * Headline poll numbers read straight off the granular electorate: appeal is
 * the share-weighted mean positional appeal, potential voters are turned-out
 * voters reached by name recognition, scaled by appeal and bucket approval.
 */
export function computePollHeadline(
  cells: PollHeadlineCell[],
  statePopulation: number,
  candidate: PollHeadlineCandidate
): PollHeadline {
  const reach = normalizeNPI(candidate.politicalInfluence);
  let appealNumer = 0;
  let appealDenom = 0;
  let totalEstimatedVoters = 0;
  let totalPotentialVoters = 0;
  for (const cell of cells) {
    const voters = cellVoters(cell, statePopulation);
    const appeal = calcAppeal(
      cell.economicLean,
      cell.socialLean,
      candidate.economicPosition,
      candidate.socialPosition,
      candidate.politicalInfluence,
      false
    );
    const approval = applyCandidateApprovalWeight(
      1,
      candidate.favorability,
      candidate.approvalBuckets,
      cell.buckets
    );
    totalEstimatedVoters += voters;
    totalPotentialVoters += voters * reach * (appeal / MAX_APPEAL) * approval;
    appealNumer += appeal * cell.share;
    appealDenom += cell.share;
  }
  return {
    overallAppeal: appealDenom > 0 ? Math.round((appealNumer / appealDenom) * 100) / 100 : 0,
    totalEstimatedVoters: Math.round(totalEstimatedVoters),
    totalPotentialVoters: Math.round(totalPotentialVoters),
  };
}

/** Head-to-head vote totals: each cell's voters split by its candidate shares. */
export function computeInRaceVotes(
  cells: Array<PollHeadlineCell & { id: string }>,
  candidateShares: Record<string, { you: number; opponents: Array<{ id: string; share: number }> }>,
  statePopulation: number
): { myVotes: number; opponentVotes: Record<string, number> } {
  let myVotes = 0;
  const opponentVotes: Record<string, number> = {};
  for (const cell of cells) {
    const shares = candidateShares[cell.id];
    if (!shares) continue;
    const voters = cellVoters(cell, statePopulation);
    myVotes += voters * shares.you;
    for (const opp of shares.opponents) {
      opponentVotes[opp.id] = (opponentVotes[opp.id] ?? 0) + voters * opp.share;
    }
  }
  return {
    myVotes: Math.round(myVotes),
    opponentVotes: Object.fromEntries(
      Object.entries(opponentVotes).map(([id, votes]) => [id, Math.round(votes)])
    ),
  };
}
