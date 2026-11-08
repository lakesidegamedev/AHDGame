/**
 * Summary-view read projections for the election resolver.
 *
 * List views render candidate summary cards from `EnrichedCandidate`, which
 * needs a fixed set of display and scoring inputs. Fetching whole documents
 * deserializes ~31KB of NPP `policies.domainPositions` per candidate (~1.5MB for
 * a 50-candidate country page) that no summary consumer reads.
 *
 * NPP: excludes only `policies.domainPositions`; every other field still loads.
 *
 * Character: the inclusion list below is the closed set summary enrichment
 * reads. ADD new fields here (not a wider fetch) when summary enrichment starts
 * reading more.
 *
 * GameState: summary enrichment reads preset, currentYear and
 * redistrictingEnabled only; the `gameState` response block is null in summary
 * mode.
 *
 * Full view keeps whole documents: detail pages and turn-adjacent overlays read
 * beyond this set.
 */
import type { Document } from "mongodb";

/** Excludes the ~30KB stance map; every other NPP field still loads. */
export const ELECTION_SUMMARY_NPP_PROJECTION: Document = {
  "policies.domainPositions": 0,
};

/** Closed inclusion set from the audit above. */
export const ELECTION_SUMMARY_CHARACTER_PROJECTION: Document = {
  name: 1,
  party: 1,
  countryId: 1,
  homeState: 1,
  avatarUrl: 1,
  sequentialId: 1,
  currentOffice: 1,
  favorability: 1,
  politicalInfluence: 1,
  nationalInfluence: 1,
  partyInfluence: 1,
  infamy: 1,
  targetedAds: 1,
  "policies.economic": 1,
  "policies.social": 1,
};

/** Everything summary enrichment reads off gameState. */
export const ELECTION_SUMMARY_GAME_STATE_PROJECTION: Document = {
  preset: 1,
  currentYear: 1,
  redistrictingEnabled: 1,
  // Cycle-anchor context: years for legacy races with none baked.
  startingYear: 1,
  preIterationTurns: 1,
  "preIteration.active": 1,
};
