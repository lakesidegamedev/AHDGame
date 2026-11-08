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
 * src/lib/electionEngine/ for the implementation.
 */

// Constants
export {
  PARTY_STRENGTH_BY_OFFICE,
  FPTP_MAJOR_PARTIES,
  FPTP_SPOILER_RATE,
} from "./electionEngine/constants";

// Types & interfaces
export type {
  EnrichedCandidate,
  DistributeVotesOptions,
  AccumulateVoteTurnPreload,
} from "./electionEngine/types";

// Vote calculations
export {
  calcEffectiveFavorability,
  calcCandidateVotePotential,
  calcStateTurnout,
  turnVoteWeight,
  resolveTurnWindow,
} from "./electionEngine/voteCalculations";

// Vote distribution
export { distributeVotesByGroupLevelAllocation } from "./electionEngine/voteDistribution";

// Candidate enrichment
export { fetchEnrichedCandidates } from "./electionEngine/candidateEnrichment";

// Tally management
export { accumulateVoteTurn, initElectionVoteTally } from "./electionEngine/tallyManagement";

// Resolved turnout (unifies static demographics with dynamic GOTV/canvassing/suppression modifiers)
export {
  resolveTurnout,
  resolveSingleGroupTurnout,
  buildLiveTurnouts,
} from "./electionEngine/resolvedTurnout";
export type { ResolvedTurnout, ResolvedTurnoutOptions } from "./electionEngine/resolvedTurnout";
