import { settleVoteTurn } from "@/lib/elections/engine/settleVoteTurn";
export { initElectionVoteTally } from "@/lib/elections/engine/tallyInitialization";
/**
 * Election vote tally accumulation and initialization.
 */

import {
  LEGISLATIVE_APPROVAL_VOTE_SLOPE,
  approvalVoteMultiplier,
} from "@/lib/elections/engine/approvalVoteMultiplier";
import { isHu1991AssemblyCampaign } from "@/lib/countries/hu/rules/assemblyCampaign1991";

import { type RaceCampaignEffectsMemo } from "@/lib/campaigns/raceCampaignEffects";

import { buildNationalSubstrate, loadNationalRegionDocs } from "./nationwideElectorate";
import { turnoutForElection } from "@/lib/campaignTargeting/rules";

import { getDb } from "@/lib/mongodb";
import type {
  Election,
  ElectionCandidate,
  ElectionVoteTally,
  State,
  StateDemographics,
} from "@/lib/db/types";
import { ObjectId, type AnyBulkWriteOperation } from "mongodb";
import { getStateApprovalForElection } from "@/lib/utils/getStateApprovalForElection";
import type { StatePartyOrg, StateDemographicTurnout, StateRegistrationPool } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { getPartyStrengthWeight, getRegionalExecutiveOfficeKey } from "@/lib/constants/countries";
import {
  isCoattailEligibleRace,
  isOwnRegionalExecutiveRace,
  resolveGovExecutiveApproval,
} from "./govCoattail";
import { officeKeyForElectionType } from "@/lib/utils/electionLabels";

import { turnVoteWeight, resolveTurnWindow } from "./voteCalculations";
import { distributeVotesByGroupLevelAllocation } from "./voteDistribution";
import { distributeVotesBySwingFlow } from "./voteDistributionSwingFlow";
import { getIncumbentSeatShareByParty } from "./incumbentSeatShare";
import { resolveSingleSeatLegislativeIncumbent } from "./singleSeatIncumbency";
import { getFundsByPartyForElection } from "./fundsByParty";
import { TALLY_WITH_SNAPSHOT_TURNS_ONLY } from "./tallyProjections";
import { planTurnSlice, sameTurnSliceParts } from "@/lib/elections/rules/turnSlice";

import { isHeadOfGovernmentRace, resolvePresidentApproval } from "./presidentialCoattail";

import type { ElectorateUnit } from "@/lib/demographics/electorateUnit";
import {
  fetchEnrichedCandidates,
  type CandidateEnrichmentPreload,
  type EnrichmentParty,
} from "./candidateEnrichment";
import type { AccumulateVoteTurnPreload } from "./types";

import { loadPartyGroupFavorability } from "@/lib/governorOffice/address/partyGroupFavorabilityLoader";
import {
  buildGranularElectorateSubstrate,
  campaignContactByBucket,
} from "@/lib/demographics/granularElectorate";
import type { ParticipationSummary } from "@/lib/demographics/v2/rules";
import { demographicsRegionKey } from "@/lib/demographics/v2/rules/regionKey";
import { eraYearContextFromGameState } from "@/lib/era/context";
import {
  scalePoolToRegistered,
  capTurnSliceToElectorate,
  capTurnSliceToRemainingElectorate,
} from "./resolvedTurnout";
import { isPrimaryEnded } from "@/lib/elections/phases";
import type { GameTimeContext } from "@/lib/time/gameTime";
import { STARTING_YEAR } from "@/lib/constants/turnTime";
import type { RegionDemographics } from "@/lib/db/types/regionDemographics";
import { RESET_V2_READY } from "@/lib/resetVersions/availability";
import { resetSystemVersionsForCountry } from "@/lib/resetVersions/rules";
import { resolveVotingAgeEligible } from "@/lib/constants/votingAge";
import { loadElectionRegionDemographicsV2 } from "./demographicsV2Preload";
import { isMidtermOppositionBoostEligible } from "./midtermOppositionBoost";
import { resolveGoverningPartyIds } from "@/lib/government/governingPartyIds";

import { loadActiveCrisisBlameShifts } from "@/lib/events/substrate/countryModifiers";
import { loadActiveLeaderLegacyShifts } from "@/lib/government/leaderLegacy";
import { type CrisisBlameShift } from "./crisisBlame";
import { buildCurrentRegistrationBaseline } from "./electionFormulaFactors";

import { validateRankedBallots } from "@/lib/elections/rules/prStv";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { statesCollection } from "@/lib/db/repositories/states";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";
import { electionVoteTalliesCollection } from "@/lib/db/repositories/electionVoteTallies";

import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import { stateDemographicsCollection } from "@/lib/db/repositories/stateDemographics";
import { stateDemographicTurnoutCollection } from "@/lib/db/repositories/stateDemographicTurnout";
import { demographicDefaultsCollection } from "@/lib/db/repositories/demographicDefaults";

import { stateRegistrationPoolCollection } from "@/lib/db/repositories/stateRegistrationPool";

// ─── Accumulate one turn of votes into a tally ───────────────────────────────

/**
 * Per-turn memo for the lookups whose inputs repeat across a turn's elections.
 * Promises, not values, so concurrent callers share one in-flight read.
 */
export interface VoteTurnMemo extends RaceCampaignEffectsMemo {
  presidentByCountry: Map<string, Promise<Awaited<ReturnType<typeof resolvePresidentApproval>>>>;
  govExecutiveByState: Map<
    string,
    Promise<Awaited<ReturnType<typeof resolveGovExecutiveApproval>>>
  >;
  partiesByCountry: Map<string, Promise<EnrichmentParty[]>>;
  partyGroupFavorabilityByCountryTurn: Map<string, Promise<Map<string, number>>>;
  crisisBlameByCountry: Map<string, Promise<CrisisBlameShift[]>>;
  candidatePreload?: CandidateEnrichmentPreload;
  executiveEndorsedCandidateIdsByElection?: Map<string, Set<string>>;
}

export function createVoteTurnMemo(): VoteTurnMemo {
  return {
    presidentByCountry: new Map(),
    govExecutiveByState: new Map(),
    partiesByCountry: new Map(),
    partyGroupFavorabilityByCountryTurn: new Map(),
    crisisBlameByCountry: new Map(),
  };
}

function memoized<T>(
  map: Map<string, Promise<T>> | undefined,
  key: string,
  load: () => Promise<T>
): Promise<T> {
  if (!map) return load();
  let pending = map.get(key);
  if (!pending) {
    pending = load();
    map.set(key, pending);
  }
  return pending;
}

async function prepareAccumulateVoteTurn(
  electionId: ObjectId,
  turnNumber: number,
  now: Date,
  options?: {
    /**
     * When present, the tally update is appended here instead of written, so
     * the caller can flush every race's update in one bulk write.
     */
    tallyWrites?: AnyBulkWriteOperation<ElectionVoteTally>[];
    approvalMap?: Map<string, number>;
    preload?: AccumulateVoteTurnPreload;
    /** The election document, when the caller already holds it; saves a read per election. */
    election?: Election;
    /** The election's tally, when the caller already loaded it this turn. */
    tally?: ElectionVoteTally;
    /** The election's active candidates, when the caller already loaded them this turn. */
    candidates?: ElectionCandidate[];
    /**
     * "early": the half-hour results tick. Release half of this turn's slice
     * ahead of the turn; the turn itself then releases the other half. Totals,
     * the closing surge and every deadline are unchanged.
     */
    slice?: "early";
  }
) {
  const db = options?.preload?.db ?? (await getDb());
  const memo = options?.preload?.turnMemo;

  const [tally, candidates]: [ElectionVoteTally | null, ElectionCandidate[]] = await Promise.all([
    options?.tally ??
      electionVoteTalliesCollection(db).findOne(
        { electionId },
        { projection: TALLY_WITH_SNAPSHOT_TURNS_ONLY }
      ),
    options?.candidates ??
      electionCandidatesCollection(db).find({ electionId, status: "active" }).toArray(),
  ]);

  if (!tally || candidates.length === 0) return { kind: "early" as const, value: undefined };
  // Per-turn idempotency: a stalled turn can re-run this phase under the
  // same turn number, and each half ("early" ahead of the turn, then "rest")
  // is counted once. A tally already holding this turn's snapshot is counted.
  const slicePlan = planTurnSlice(
    sameTurnSliceParts(tally.turnSnapshots, turnNumber),
    options?.slice
  );
  if (!slicePlan) return { kind: "early" as const, value: undefined };
  const { slicePart, fraction: sliceFraction } = slicePlan;

  const election =
    options?.election ?? (await electionsCollection(db).findOne({ _id: electionId }));
  if (!election || !election.endTime) return { kind: "early" as const, value: undefined };
  // Ranked ballots split cleanly: each half casts its own first-preference
  // increments, and identical rankings merge by adding weights.
  const isPrStv = tally.countingMethod === "pr_stv";
  if (isPrStv) {
    if (
      !countryHasFeature("ieElections", election.countryId) ||
      !["dail", "localCouncil"].includes(election.electionType)
    )
      throw new Error("Ranked PR-STV is supported only for Irish Dail and local council races");
    validateRankedBallots(tally.rankedBallots, tally.totalVotes);
  }

  const stateId = election.state as string;
  let state: State | null;
  let demographics: StateDemographics | null;
  let statePartyOrgs: StatePartyOrg[];
  let turnoutDoc: StateDemographicTurnout | null;
  let registrationPool: StateRegistrationPool | null = null;
  let preset: string | undefined;
  let eraYear: { year: number | null; startingYear: number | null };
  let regionDemographics: RegionDemographics | null = null;
  let demographicsV2Active = false;
  let votingAge = 18;
  let partyRenewalEnabled = false;

  if (options?.preload) {
    state = options.preload.stateMap.get(stateId) ?? null;
    demographics = options.preload.demographicsMap.get(stateId) ?? null;
    statePartyOrgs = options.preload.statePartyOrgsByState.get(stateId) ?? [];
    turnoutDoc = options.preload.turnoutByState.get(stateId) ?? null;
    registrationPool = options.preload.registrationPoolByState?.get(stateId) ?? null;
    preset = options.preload.preset;
    eraYear = eraYearContextFromGameState({
      currentYear: options.preload.currentYear,
      startingYear: options.preload.startingYear,
    });
    regionDemographics =
      options.preload.regionDemographicsByState?.get(
        demographicsRegionKey(election.countryId ?? "US", stateId)
      ) ?? null;
    demographicsV2Active =
      options.preload.demographicsV2Countries?.has(election.countryId ?? "US") === true;
    votingAge = options.preload.votingAgeByCountry?.get(election.countryId ?? "US") ?? 18;
    partyRenewalEnabled = options.preload.partyRenewalEnabled === true;
  } else {
    const [s, d, spo, t, rp, gs] = await Promise.all([
      statesCollection(db).findOne({ _id: stateId, countryId: election.countryId }),
      stateDemographicsCollection(db).findOne({ _id: stateId, countryId: election.countryId }),
      statePartyOrgCollection(db).find({ stateId, countryId: election.countryId }).toArray(),
      stateDemographicTurnoutCollection(db).findOne({
        _id: stateId,
        countryId: election.countryId,
      }),
      stateRegistrationPoolCollection(db).findOne({ stateId, countryId: election.countryId }),
      gameStateCollection(db).findOne(
        { _id: "current" },
        {
          projection: {
            preset: 1,
            currentYear: 1,
            currentTurn: 1,
            startingYear: 1,
            votingAgeEligible: 1,
            votingAgeEligibleByCountry: 1,
            resetWorldId: 1,
            resetVersionSeeds: 1,
            demographicsSystemVersion: 1,
            nppPartyRenewalEnabled: 1,
          },
        }
      ),
    ]);
    state = s;
    demographics = d;
    statePartyOrgs = spo;
    turnoutDoc = t;
    registrationPool = rp;
    preset = gs?.preset;
    eraYear = eraYearContextFromGameState(gs);
    partyRenewalEnabled = gs?.nppPartyRenewalEnabled === true;
    demographicsV2Active =
      resetSystemVersionsForCountry(gs, RESET_V2_READY, election.countryId ?? "US").demographics ===
      "v2";
    votingAge = resolveVotingAgeEligible(gs ?? undefined, eraYear.year, election.countryId ?? "US");
    regionDemographics = await loadElectionRegionDemographicsV2({
      db,
      countryId: election.countryId ?? "US",
      stateId,
      gameState: gs,
    });
  }

  if (!state || !demographics) return { kind: "early" as const, value: undefined };

  const partyOrgByParty = new Map(statePartyOrgs.map((po) => [po.partyId, po.organization]));
  // Phase 5a: Reg as persuasion-resistance multiplier in general-election
  // distribution. Rows whose `registration` field is undefined (pre-seed)
  // simply aren't added to the map → `regResistanceMultiplier(undefined)`
  // returns the neutral 1.0× downstream. Rows seeded with a real value
  // contribute the entrenchment tilt per `electionFormulaFactors.ts`.
  const regByParty = new Map<string, number>();
  for (const po of statePartyOrgs) {
    if (typeof po.registration === "number") regByParty.set(po.partyId, po.registration);
  }
  // UK general elections use current Reg as their structural party baseline.
  // Other countries keep the lane disabled so their existing Reg resistance
  // and peel behavior is unchanged. If an old UK world has no current Reg data
  // at all, the helper also disables the lane rather than flooring every party.
  const regBaselineByParty = buildCurrentRegistrationBaseline(statePartyOrgs, election.countryId);

  // Turn-first surge window (drift-immune) with a Date fallback for legacy docs.
  // Anchor the window at the GENERAL-election start (`primaryEndTurn`), NOT the
  // overall `startTurn`: general votes only accrue after the primary, so spanning
  // the primary period smears the early-vote share across turns that cast no
  // general votes and inflates the final turns.
  // `?? startTurn` preserves prior behavior for races with no primary window.
  const { totalTurns, turnIndex } = resolveTurnWindow({
    startTurn: election.primaryEndTurn ?? election.startTurn,
    endTurn: election.endTurn,
    startTime: election.primaryEndTime ?? election.startTime,
    endTime: election.endTime,
    createdAt: tally.createdAt,
    currentTurn: turnNumber,
    now,
    // The turn that reaches endTurn still counts (timers complete the race
    // AFTER this phase), so the window is inclusive: endTurn - start + 1 slices.
    inclusiveEnd: true,
  });

  // Age-aware electorate (P1b-1b): the vote pool is the live voting-age population
  // (Σ ages ≥ votingAgeEligible), written each turn by the demographic phase, so
  // the electorate tracks kids aging past 18 and deaths removing voters. Falls
  // back to total population on worlds not yet seeded with cohort vectors — vote
  // SHARES are invariant to this basis (the F-4 guarantee), only magnitude differs.
  const electorate = state.votingEligiblePopulation ?? state.population;

  const campaignContact = demographicsV2Active ? campaignContactByBucket(turnoutDoc) : {};
  turnoutDoc = turnoutForElection(turnoutDoc, election) ?? null;

  // Party strength: state government approval times office strength. Scales the vote pool.
  // Approval is centered at 50% (no boost) and swings +/-10% at the 0%/100% extremes
  // via (1 + (approvalDecimal - 0.5) * 0.2), so it cannot dominate the pool.
  const electionCountryId = (election.countryId ?? "US") as CountryId;

  // These three reads are mutually independent: state approval keys off the
  // region, candidate enrichment off `candidates`, party-group favorability off
  // the country + turn. One parallel round-trip instead of three serial ones —
  // this path runs for every active election on every turn.
  //
  // enriched: candidates enriched for group-level competitive allocation.
  // State/Senate/House races put politicalInfluence in reach only, not appeal.
  //
  // partyGroupFavorabilityByKey: Address-sourced per-group appeal boosts for the
  // leader's party. Country-scoped, keyed `${partyId}:${groupId}` for O(1)
  // lookup in the vote-distribution inner loop.
  const preloadedApproval =
    options?.approvalMap?.get(`${election.countryId ?? "US"}:${election.state.toUpperCase()}`) ??
    options?.approvalMap?.get(election.state.toUpperCase());
  const [approvalPct, enriched, partyGroupFavorabilityByKey] = await Promise.all([
    preloadedApproval ?? getStateApprovalForElection(election.state, electionCountryId),
    fetchEnrichedCandidates(candidates, {
      countryId: electionCountryId,
      partiesCache: memo?.partiesByCountry,
      preload: memo?.candidatePreload,
      countryConfig: options?.preload?.enrichmentCountryConfigByElection?.get(
        electionId.toString()
      ),
      db: options?.preload?.db,
    }),
    memoized(memo?.partyGroupFavorabilityByCountryTurn, `${electionCountryId}:${turnNumber}`, () =>
      loadPartyGroupFavorability(db, electionCountryId, turnNumber)
    ),
  ]);
  const approvalDecimal = approvalPct / 100;
  // Normalize snap_* → regular for office-strength lookup (snap_commons uses the
  // same party-strength weight as commons — same constituency, same office).
  const officeStrength = getPartyStrengthWeight(
    electionCountryId,
    officeKeyForElectionType(election.electionType as string, electionCountryId)
  );
  const strengthMultiplier =
    approvalVoteMultiplier(approvalDecimal, LEGISLATIVE_APPROVAL_VOTE_SLOPE) * officeStrength;

  // ── Granular-cell electorate substrate ─────────────────────────────────────
  // The electorate is Layer-1 cells. Same engines, same appeal formula.
  // Regional contests need a census row. A nationwide contest (the region id
  // is the country id) folds every region's census cells together.
  let effElectorate: ElectorateUnit[] = [];
  let effLiveTurnouts: Record<string, number> = {};
  let effTotalPool = 0;
  let effEffectiveTurnPool = 0;
  let effEnriched = enriched;
  let effPartyGroupFavorabilityByKey = partyGroupFavorabilityByKey;
  let participationSummary: ParticipationSummary | undefined;
  {
    // Seeded snapshot for the legislation lean-drift fold. Preloaded on the
    // batched general path; a single extra read on the standalone path (only
    // ever paid when the flag is on).
    const demographicDefaults =
      options?.preload?.demographicDefaultsByState?.get(stateId) ??
      (options?.preload
        ? null
        : await demographicDefaultsCollection(db).findOne({
            _id: stateId,
            countryId: election.countryId,
          }));
    const substrate = buildGranularElectorateSubstrate({
      campaignRulesVersion: election.campaignRulesVersion,
      currentTurn: turnNumber,
      countryId: electionCountryId,
      stateId,
      preset,
      turnoutDoc,
      statePopulation: electorate,
      demographics,
      enriched,
      partyGroupFavorabilityByKey,
      demographicDefaults,
      year: eraYear.year,
      startingYear: eraYear.startingYear,
      ...(demographicsV2Active && regionDemographics
        ? {
            v2: {
              regionAges: regionDemographics.ages,
              votingAge,
              registeredShare:
                typeof registrationPool?.unregistered === "number" &&
                Number.isFinite(registrationPool.unregistered)
                  ? 1 - Math.max(0, Math.min(100, registrationPool.unregistered)) / 100
                  : 1,
              contactByBucket: campaignContact,
            },
          }
        : {}),
    });
    if (substrate) {
      effElectorate = substrate.electorate;
      effLiveTurnouts = substrate.liveTurnouts;
      effTotalPool = substrate.totalPool;
      effEffectiveTurnPool =
        turnVoteWeight(totalTurns, turnIndex, substrate.totalPool) * strengthMultiplier;
      effEnriched = substrate.enriched;
      effPartyGroupFavorabilityByKey =
        substrate.partyGroupFavorabilityByKey ?? partyGroupFavorabilityByKey;
      participationSummary = substrate.participationSummary;
    } else if (stateId === electionCountryId) {
      const regional = options?.preload ?? (await loadNationalRegionDocs(db, electionCountryId));
      const national = buildNationalSubstrate({
        countryId: electionCountryId,
        nationalDemographics: demographics,
        stateMap: regional.stateMap,
        demographicsMap: regional.demographicsMap,
        turnoutByState: regional.turnoutByState,
        demographicDefaultsByState: regional.demographicDefaultsByState,
        election,
        currentTurn: turnNumber,
        preset,
        year: eraYear.year,
        startingYear: eraYear.startingYear,
        enriched,
        partyGroupFavorabilityByKey,
      });
      effElectorate = national.electorate;
      effLiveTurnouts = national.liveTurnouts;
      effTotalPool = national.totalPool;
      effEffectiveTurnPool =
        turnVoteWeight(totalTurns, turnIndex, national.totalPool) * strengthMultiplier;
      effEnriched = national.enriched;
      effPartyGroupFavorabilityByKey =
        national.partyGroupFavorabilityByKey ?? partyGroupFavorabilityByKey;
    } else {
      throw new Error(`No census electorate for ${electionCountryId} region ${stateId}`);
    }
  }
  // ── Physical electorate ceiling ────────────────────────────────────────────
  // The resolved turnout pool can exceed the people who exist: the granular
  // substrate aggregates turnout over overlapping demographic dimensions. A state
  // cannot cast more ballots than it has eligible voters, so the per-turn slice
  // is rescaled to the electorate's share. Vote shares are invariant to the pool
  // basis, so this changes reported magnitudes only.
  //
  // Scale ONLY the released turn slice, never `effTotalPool`: distributors
  // normalize each group by `totalPool` before multiplying by the slice, so
  // shrinking both cancels to the ballot. The half-hour split gives each half
  // half the turn's slice before these caps, so the caps still bound the whole turn.
  effEffectiveTurnPool *= sliceFraction;
  effEffectiveTurnPool = capTurnSliceToElectorate(effEffectiveTurnPool, effTotalPool, electorate);
  // ── Registered-voter gate ──────────────────────────────────────────────────
  // The unregistered slice of the registration pool cannot cast a ballot, so
  // this turn's released pool shrinks to the registered share. Shares, seats
  // and winners are invariant; only reported magnitudes and turnout change.
  //
  // Scale ONLY the turn pool, never `effTotalPool`: distributors normalize each
  // group as `contribution / totalPool` then multiply by the turn pool, so
  // scaling both cancels out and the gate becomes a no-op.
  if (!participationSummary) {
    effEffectiveTurnPool = scalePoolToRegistered(
      effEffectiveTurnPool,
      registrationPool?.unregistered
    );
  }
  // ── Cumulative ceiling ────────────────────────────────────────────────────
  // The strength multiplier above sits outside both caps, so the closing
  // surge could still carry the race past the registered electorate. Ballots
  // already on the board (active candidates only, matching `newTotals`) plus
  // this slice may never exceed it. Bound Duma ballots also retain votes cast
  // before a nominee withdrew.
  const isBgOrdinary =
    preset === "1991-default" &&
    countryHasFeature("bgElections", election.countryId) &&
    election.electionType === "nationalAssembly" &&
    election.cycle >= 1;
  const isHuBound =
    isHu1991AssemblyCampaign(election) ||
    (preset === "1991-default" &&
      countryHasFeature("huElections", election.countryId) &&
      (election.hungarianModernByElection != null || election.hungarianModernAssembly != null));
  const isJapanMixed =
    preset === "1991-default" &&
    countryHasFeature("jpElections", election.countryId) &&
    (election.electionType === "shugiin" || election.electionType === "snap_shugiin") &&
    election.japanShugiinRules?.ruleVersion === "mixed-1994-v1";
  const isBgFounding =
    countryHasFeature("bgElections", election.countryId) &&
    election.electionType === "nationalAssembly" &&
    election.bulgarianFoundingRound?.ruleVersion === "parallel-1990-v1";
  const huRegisteredVoters =
    election.bulgarianFoundingRound?.registeredVoters ??
    election.hungarianModernByElection?.registeredVoters ??
    election.hungarianModernAssembly?.registeredVoters ??
    election.hungarianAssemblyRound?.registeredVoters ??
    Math.max(
      Math.floor(scalePoolToRegistered(electorate, registrationPool?.unregistered)),
      Object.values(tally.totalVotes).reduce((sum, votes) => sum + votes, 0)
    );
  const isBoundDuma =
    countryHasFeature("ruElections", election.countryId) &&
    election.electionType === "dumaDeputy" &&
    election.russianDumaRound != null;
  const isBoundCouncil =
    countryHasFeature("ruElections", election.countryId) &&
    election.electionType === "federationCouncilMember" &&
    election.russianCouncilRound != null;
  // Bespoke national ballot systems split like the rest: every per-slice
  // clamp below is against the cumulative register (so two halves clamp to
  // the same total as one slice), and their per-district, list and ledger
  // maps add each half's increments.
  const alreadyCast = isPrStv
    ? Object.values(tally.totalVotes).reduce((sum, votes) => sum + votes, 0)
    : isBoundCouncil
      ? (tally.russianCouncilBallot?.validBallots ?? 0)
      : isBoundDuma
        ? Object.values(tally.totalVotes).reduce((sum, count) => sum + count, 0) +
          (tally.russianDumaBallot?.againstAllVotes ?? 0)
        : isHuBound || isBgFounding
          ? Object.values(tally.totalVotes).reduce((sum, count) => sum + count, 0)
          : candidates.reduce((sum, c) => sum + (tally.totalVotes[c._id.toString()] ?? 0), 0);
  effEffectiveTurnPool = capTurnSliceToRemainingElectorate(
    effEffectiveTurnPool,
    alreadyCast,
    isHuBound || isBgFounding
      ? huRegisteredVoters!
      : scalePoolToRegistered(electorate, registrationPool?.unregistered)
  );
  // Determine if we are in the general election phase (after primary end).
  // Turn-first (drift-immune, freezes on pause); falls back to the Date for
  // elections not yet backfilled. `now` is the game-time of this turn, so it
  // doubles as effectiveNow for the fallback path.
  const phaseGameTime: GameTimeContext = {
    currentTurn: turnNumber,
    lastTurnProcessed: now,
    isActive: true,
    pausedAt: null,
    effectiveNow: now,
    // Inert here — isPrimaryEnded only reads effectiveNow for the Date fallback.
    startingYear: STARTING_YEAR,
  };
  const isGeneralElection = isPrimaryEnded(election, turnNumber, phaseGameTime);
  // NPP weight penalty only applies in the general phase (not primaries, which use score-based handicap).
  const hasPlayerInRace = isGeneralElection && enriched.some((c) => !c.isNPP);
  // General elections use the §7.3.2 swing-flow engine. Primaries keep the
  // legacy allocator; §7.3.2 is general-only and primaryResolution.ts has its
  // own formula.
  // Per-candidate margin vs the legacy engine is pinned at +/-10pt by
  // voteDistributionSwingFlowDiff.test.ts. Race-family coverage is in
  // voteDistributionSwingFlowFamilies.test.ts.
  const distributeFn = isGeneralElection
    ? distributeVotesBySwingFlow
    : distributeVotesByGroupLevelAllocation;

  const isOwnHeadOfGovernmentRace = isHeadOfGovernmentRace(
    election.electionType as string,
    electionCountryId
  );
  // Coattail gating uses the parties actually fielding candidates in THIS
  // race (matches the display path in enrichElection.ts), not the state's
  // StatePartyOrg rows: a party can hold an org row without a candidate in
  // the race (engine applied a coattail the display never showed) or field
  // a candidate without an org row (coattail wrongly suppressed).
  const partyIdsInRace = new Set(enriched.map((ec) => ec.party));
  const regionalExecOfficeType = getRegionalExecutiveOfficeKey(electionCountryId);
  const wantsMidtermOppositionBoost =
    isGeneralElection && isMidtermOppositionBoostEligible(election);

  // Every gate below is pure (derived from `election`, `candidates` and
  // `enriched`, all already resolved), so the five driver lookups they guard
  // are decided up front and issued as ONE parallel round-trip. They were five
  // sequential awaits, paid on every active election every turn.
  //
  // The two governor-approval consumers share a single fetch: the coattail gate
  // and the own-race gate are mutually exclusive by construction
  // (`isCoattailEligibleRace` returns false exactly when the race IS the
  // regional executive's own seat), so at most one consumes it — but resolving
  // it once keeps that invariant from costing a second round-trip if the
  // predicates ever widen.
  const wantsGovCoattail = isCoattailEligibleRace({
    isGeneralElection,
    electionType: election.electionType as string,
    regionalExecOfficeType,
    isOwnHeadOfGovernmentRace,
  });
  const wantsOwnExecIncumbency =
    Boolean(stateId) &&
    isOwnRegionalExecutiveRace({
      isGeneralElection,
      electionType: election.electionType as string,
      regionalExecOfficeType,
      hasState: Boolean(stateId),
    });
  const runningIdentities = new Set(
    candidates
      .map((c) => (c.characterId ?? c.nppId)?.toString())
      .filter((id): id is string => Boolean(id))
  );

  const [
    priorSeatShareByParty,
    fundsByParty,
    president,
    govExecutive,
    legInc,
    governingPartyIds,
    crisisBlameShifts,
  ] = await Promise.all([
    // A1 — share-weighted incumbency. Prior-cycle vote-share for this seat so
    // the swing-flow engine's incumbency driver can scale lift / drag by how
    // much each party was defending. Empty Map when no prior cycle exists
    // (driver returns 0, matching open-seat semantics). General elections
    // only — primaries don't route through the swing-flow engine. Races with
    // an officeholder incumbency path (US Senate, and single-winner executives
    // such as governor / president) are excluded by `usesSeatShareIncumbency`
    // inside the resolver: they use the flat-shield / approval-curve paths
    // below, never the raw-vote-share fallback, which would price a meaningless
    // margin for a single winner — and on a VACANT seat would hand out an
    // incumbency bonus with no incumbent behind it.
    isGeneralElection
      ? (options?.preload?.incumbentSeatShareByElection?.get(electionId.toString()) ??
        getIncumbentSeatShareByParty(election, db))
      : undefined,
    // Money driver. Aggregate per-party recent spend across all campaigns
    // in the race (carried stock plus this turn's accumulator). Reads
    // spend persistence, not treasury balance; the `campaignSpendReset`
    // phase folds the accumulator into the decaying stock after this
    // accumulator runs.
    isGeneralElection
      ? options?.preload?.fundsByPartyByElection
        ? (options.preload.fundsByPartyByElection.get(electionId.toString()) ??
          new Map<string, number>())
        : getFundsByPartyForElection(electionId, db)
      : undefined,
    // Presidential coattail: the sitting President's party gets an
    // approval-driven nominal-share nudge in every down-ballot general
    // nationwide (US only). Excludes the presidential race itself. A vacant
    // presidency or a party not present in this race no-ops to neutral.
    isGeneralElection && !isOwnHeadOfGovernmentRace
      ? memoized(memo?.presidentByCountry, electionCountryId, () =>
          resolvePresidentApproval(db, electionCountryId)
        )
      : undefined,
    // Governor coattail (§7.3.2 govModifier) — the sitting regional
    // executive's party gets a small nominal-share bonus in its own state's
    // down-ballot generals, and the own-race path feeds the same approval
    // into the incumbency driver.
    wantsGovCoattail || wantsOwnExecIncumbency
      ? memoized(memo?.govExecutiveByState, `${electionCountryId}:${stateId}`, () =>
          resolveGovExecutiveApproval(db, electionCountryId, stateId)
        )
      : undefined,
    // Single-seat legislative own-race (US Senate): flat incumbency shield
    // keyed to the sitting senator, decaying with tenure to a +1 floor. Null
    // (skipped) for open seats / incumbent not running / non-senate races.
    isGeneralElection
      ? options?.preload?.legislativeIncumbentByElection
        ? options.preload.legislativeIncumbentByElection.get(electionId.toString())
        : resolveSingleSeatLegislativeIncumbent(election, runningIdentities, db)
      : undefined,
    wantsMidtermOppositionBoost
      ? (options?.preload?.governingPartyIdsByCountry?.get(electionCountryId) ??
        resolveGoverningPartyIds(db, electionCountryId))
      : undefined,
    // Credit and blame for how office holders handled recent crises.
    isGeneralElection
      ? memoized(memo?.crisisBlameByCountry, electionCountryId, async () => [
          ...(await loadActiveCrisisBlameShifts(db, electionCountryId, turnNumber)),
          // A departed leader's legacy rides the same bounded party shift.
          ...(await loadActiveLeaderLegacyShifts(db, electionCountryId, turnNumber)),
        ])
      : undefined,
  ]);
  return {
    kind: "context" as const,
    context: {
      candidates,
      crisisBlameShifts,
      db,
      distributeFn,
      effEffectiveTurnPool,
      effElectorate,
      effEnriched,
      effLiveTurnouts,
      effPartyGroupFavorabilityByKey,
      effTotalPool,
      election,
      electionCountryId,
      electionId,
      electorate,
      enriched,
      governingPartyIds,
      govExecutive,
      huRegisteredVoters,
      isBgFounding,
      isBgOrdinary,
      isBoundCouncil,
      isBoundDuma,
      isGeneralElection,
      isHuBound,
      isJapanMixed,
      isOwnHeadOfGovernmentRace,
      isPrStv,
      legInc,
      memo,
      now,
      options,
      participationSummary,
      partyIdsInRace,
      partyOrgByParty,
      partyRenewalEnabled,
      preset,
      president,
      priorSeatShareByParty,
      slicePart,
      state,
      stateId,
      statePartyOrgs,
      tally,
      turnNumber,
      wantsGovCoattail,
      wantsMidtermOppositionBoost,
      wantsOwnExecIncumbency,
      hasPlayerInRace,
      regByParty,
      regBaselineByParty,
      fundsByParty,
    },
  };
}
export type AccumulateVoteTurnStageContext = Extract<
  Awaited<ReturnType<typeof prepareAccumulateVoteTurn>>,
  { kind: "context" }
>["context"];

export async function accumulateVoteTurn(
  ...args: Parameters<typeof prepareAccumulateVoteTurn>
): Promise<void> {
  const prepared = await prepareAccumulateVoteTurn(...args);
  if (prepared.kind === "early") return prepared.value;
  return settleVoteTurn(prepared.context);
}
