/**
 * Election Engine
 *
 * Shared logic for how many votes each candidate reaches per turn, using the
 * same demographic weighting as the poll system.
 *
 * Each demographic group's share of the turn pool is split among candidates
 * by relative appeal within that group. The final 4 turns are worth 25% of the
 * pool; early turns share 75%. `totalPool` derives from the state's total
 * estimated turnout (the poll's totalEstimatedVoters).
 *
 * Re-exports public symbols from focused sub-modules; see
 * src/lib/elections/engine/ for the implementation.
 */

// Constants
export { PARTY_STRENGTH_BY_OFFICE, FPTP_MAJOR_PARTIES, FPTP_SPOILER_RATE } from "./constants";

// Types & interfaces
export type { EnrichedCandidate, DistributeVotesOptions, AccumulateVoteTurnPreload } from "./types";

// Vote calculations
export {
  calcEffectiveFavorability,
  calcCandidateVotePotential,
  calcStateTurnout,
  turnVoteWeight,
  resolveTurnWindow,
} from "./voteCalculations";

// Vote distribution
export { distributeVotesByGroupLevelAllocation } from "./voteDistribution";

// Candidate enrichment
export { fetchEnrichedCandidates } from "./candidateEnrichment";

// Tally management
export { accumulateVoteTurn, initElectionVoteTally } from "./tallyManagement";
