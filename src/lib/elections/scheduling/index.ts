/**
 * Perpetual election spawning re-export barrel.
 *
 * Keeps the public surface of `perpetualElections/` identical so importers are
 * untouched and a single-country calendar change is a small diff.
 */

export {
  advanceElectionTimers,
  buildCanonicalSpawn,
  buildHouseSeatHealOps,
  cleanupDuplicateElections,
  cleanupStaleElectionCandidates,
  electionGameStateSnapshot,
  endTimeToLarpTurn,
  ensurePerpetualElections,
  getCurrentTurnAndCtx,
  getGeneralWindow,
  justResolvedInSameTurn,
  ngElectionsLive,
  readCurrentTurnAndCtx,
  sendBatchedElectionAnnouncements,
  withElectionGameStateSnapshot,
} from "./engine";
export type { TurnAndCtx } from "./engine";
export {
  IE_LOCAL_COUNCIL_SEATS,
  SCO_REGIONAL_COUNCIL_SEATS,
  UK_GOVERNOR_REGIONS,
  WAL_REGIONAL_COUNCIL_SEATS,
  buildDelegateSeatHealOps,
  countryElectionsLive,
  ddElectionsLive,
  easternBlocElectionsLive,
  ensureEasternBlocAssemblyElections,
  ensurePresidentialElection,
  ensureRegionalDelegateElections,
  ensureRegionalGovernorElections,
  ensureSecededChamberElections,
  mirrorPeerRaceTiming,
  ruElectionsLive,
  seatsFromRegionField,
} from "./shared";
export type { RegionalDelegateSpec } from "./shared";
export {
  ensureATElections,
  ensureESElections,
  ensureESSenateElections,
  ensureFIElections,
  ensureFRElections,
  ensureFRSenateElections,
  ensureGRElections,
  ensureITElections,
  ensureITSenateElections,
  ensureSEElections,
  ensureTRElections,
  ensureTRSenateElections,
} from "./countries/betaParliaments";
export {
  ensureBRElections,
  ensureBRSenateElections,
  ensureBRGovernorElections,
  ensureBRPresidentialElection,
} from "./countries/br";
export {
  ensureCNElections,
  ensureCNGovernorElections,
  ensureCNPeoplesCongressElections,
} from "./countries/cn";
export {
  ensureDDGovernorElections,
  ensureDDLandAssemblyElections,
  ensureDDVolkskammerElections,
} from "./countries/dd";
export { ensureDEElections } from "./countries/de";
export {
  ensureBALElections,
  ensureBLRElections,
  ensureUKRElections,
  ensureYUElections,
} from "./countries/easternBloc";
export { ensureHUElections } from "@/lib/countries/hu/perpetualElections";
export { ensureCSElections, ensureCSNationsElections } from "@/lib/countries/cs/elections";
export { ensurePLElections, ensurePLSenateElections } from "@/lib/countries/pl/elections";
export { ensureBGElections } from "@/lib/countries/bg/elections";
export { ensureROElections } from "@/lib/countries/ro/elections";
export {
  ensureIECathaoirleachElections,
  ensureIEElections,
  ensureIELocalCouncilElections,
  ensureIEUachtaranElections,
} from "./countries/ie";
export {
  ensureJPCouncillorElections,
  ensureJPElections,
  ensureJPGovernorElections,
  ensureJPRegionalCouncilElections,
} from "./countries/jp";
export {
  ensureNGElections,
  ensureNGGovernorElections,
  ensureNGPresidentialElection,
  ensureNGRegionalCouncilElections,
  ensureNGSenateElections,
  ensureNGZoneElections,
} from "./countries/ng";
export {
  ensureRUGovernorElections,
  ensureRUNationalitiesElections,
  ensureRURepublicSovietElections,
  ensureRUSupremeSovietElections,
  ensureRUUnionCongressElections,
} from "./countries/ru";
export {
  ensureUKElections,
  ensureUKGovernorElections,
  ensureUKRegionalCouncilElections,
} from "./countries/uk";
export {
  ensureSCOElections,
  ensureSCOGovernorElections,
  ensureSCORegionalCouncilElections,
  ensureWALElections,
  ensureWALGovernorElections,
  ensureWALRegionalCouncilElections,
} from "./countries/ukDevolved";
export { SPAWN_ELECTIONS_REGISTRY } from "@/lib/elections/scheduling/registry";
export type { SpawnElectionsHandler, SpawnElectionsResult } from "@/lib/elections/scheduling/registry";

// The DE Landtag/Minister-President spawners live in `election/germanyLandtag`;
// the original module re-exported them here for countryPhases.ts's barrel import.
export {
  ensureDELandtagElections,
  ensureDEMinisterPresidentElections,
} from "@/lib/elections/resolution/germanyLandtag";

// Re-exported so existing consumers (sync-date, snapElection, admin routes)
// that import DEFAULT_DURATIONS from this module keep working.
export { DEFAULT_DURATIONS } from "@/lib/constants/electionDurations";
