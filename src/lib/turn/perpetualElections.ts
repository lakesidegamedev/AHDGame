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
} from "./perpetualElections/engine";
export type { TurnAndCtx } from "./perpetualElections/engine";
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
} from "./perpetualElections/shared";
export type { RegionalDelegateSpec } from "./perpetualElections/shared";
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
} from "./perpetualElections/countries/betaParliaments";
export {
  ensureBRElections,
  ensureBRSenateElections,
  ensureBRGovernorElections,
  ensureBRPresidentialElection,
} from "./perpetualElections/countries/br";
export {
  ensureCNElections,
  ensureCNGovernorElections,
  ensureCNPeoplesCongressElections,
} from "./perpetualElections/countries/cn";
export {
  ensureDDGovernorElections,
  ensureDDLandAssemblyElections,
  ensureDDVolkskammerElections,
} from "./perpetualElections/countries/dd";
export { ensureDEElections } from "./perpetualElections/countries/de";
export {
  ensureBALElections,
  ensureBLRElections,
  ensureUKRElections,
  ensureYUElections,
} from "./perpetualElections/countries/easternBloc";
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
} from "./perpetualElections/countries/ie";
export {
  ensureJPCouncillorElections,
  ensureJPElections,
  ensureJPGovernorElections,
  ensureJPRegionalCouncilElections,
} from "./perpetualElections/countries/jp";
export {
  ensureNGElections,
  ensureNGGovernorElections,
  ensureNGPresidentialElection,
  ensureNGRegionalCouncilElections,
  ensureNGSenateElections,
  ensureNGZoneElections,
} from "./perpetualElections/countries/ng";
export {
  ensureRUGovernorElections,
  ensureRUNationalitiesElections,
  ensureRURepublicSovietElections,
  ensureRUSupremeSovietElections,
  ensureRUUnionCongressElections,
} from "./perpetualElections/countries/ru";
export {
  ensureUKElections,
  ensureUKGovernorElections,
  ensureUKRegionalCouncilElections,
} from "./perpetualElections/countries/uk";
export {
  ensureSCOElections,
  ensureSCOGovernorElections,
  ensureSCORegionalCouncilElections,
  ensureWALElections,
  ensureWALGovernorElections,
  ensureWALRegionalCouncilElections,
} from "./perpetualElections/countries/ukDevolved";
export { SPAWN_ELECTIONS_REGISTRY } from "./perpetualElections/registry";
export type { SpawnElectionsHandler, SpawnElectionsResult } from "./perpetualElections/registry";

// The DE Landtag/Minister-President spawners live in `election/germanyLandtag`;
// the original module re-exported them here for countryPhases.ts's barrel import.
export {
  ensureDELandtagElections,
  ensureDEMinisterPresidentElections,
} from "@/lib/turn/election/germanyLandtag";

// Re-exported so existing consumers (sync-date, snapElection, admin routes)
// that import DEFAULT_DURATIONS from this module keep working.
export { DEFAULT_DURATIONS } from "@/lib/constants/electionDurations";
