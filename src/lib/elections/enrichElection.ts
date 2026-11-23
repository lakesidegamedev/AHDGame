import { enrichElectionResults } from "@/lib/elections/enrichElectionResults";

/**
 * Election details show registered candidates, primary results and counted votes.
 * _enrichElection retains Russian national list nominees together and uses the
 * same primary advance limit as the resolver.
 */

import { COUNTRY_CONFIGS } from "@/lib/constants/countries";

import { computeSeatMargins, type SeatProjection } from "@/lib/elections/seatMargins";
import type { CongressionalDistrict } from "@/lib/db/types/congressionalDistrict";
import { oneRowPerTurn } from "@/lib/elections/rules/turnSlice";
import { hu1991PrimaryAdvanceLimit } from "@/lib/countries/hu/rules/assemblyCampaign1991";
import { russianAssemblyPrimaryAdvanceLimit } from "@/lib/countries/ru/assemblyPrimaryProgression";
import { usesLegacyPresidentialCampaign } from "@/lib/countries/ru/rules/presidentialCampaign";
/**
 * Low-level enrichment function that accepts pre-fetched dependencies.
 * Exported with underscore prefix to signal that it is an internal helper
 * intended for use by resolveElection() and resolveElections().
 *
 * @param election   - The election document
 * @param deps       - All pre-fetched dependency data
 * @param options    - View mode and user context
 * @param gameTime   - Pre-fetched game time context
 * @param gameState  - Pre-fetched game state document (may be null)
 * @param db         - Database connection (needed for full-view tally operations)
 * @param adjacentElections - For nav; pass null/undefined in summary mode
 */

import { applyStandingAds } from "@/lib/campaignTargeting/standingAds";

import { PRIMARY_SHARE_SOFTMAX_TEMPERATURE } from "@/lib/primaryScore";
import {
  meanAdBonus,
  targetedAdBonuses,
  campaignPrimaryScore,
} from "@/lib/campaignTargeting/rules";
import { loadCampaignAudience, loadNationalCampaignCells } from "@/lib/campaignTargeting/audience";
import type { Db, ObjectId as MongoObjectId } from "mongodb";
import { blocListQuota, blocListQuotaForGovernment } from "@/lib/constants/blocList";
import { getCountryState } from "@/lib/countryState";
import { allocateBlocListSeats } from "@/lib/elections/resolution/blocListAllocation";
import { MULTI_SEAT_TYPES } from "@/lib/utils/electionLabels";

import { ObjectId } from "mongodb";
import type {
  Election,
  Character,
  NPP,
  GameState,
  NPPEndorsement,
  PlayerEndorsement,
  PrimarySnapshot,
  Campaign,
  StatePartyOrg,
  State,
} from "@/lib/db/types";
import { getPrimaryWinnersForElection, type CountryId } from "@/lib/constants/countries";

import { getCharacterByUserId } from "@/lib/db/characterLookup";

import { type GameTimeContext } from "@/lib/time/gameTime";
import { computeElectionPhase } from "@/lib/elections/phases";
import {
  enrichElectionCandidates,
  groupCandidatesByParty,
  type EnrichedCandidate,
  type PrimaryCalendarWave,
} from "@/lib/elections/candidateEnrichment";

import { projectDistrictedSeats } from "@/lib/redistricting/districtedHouseResolution";
import { buildPrimaryShareMap } from "@/lib/elections/resolution/generalResolutionHelpers";
import { selectEndedDisplayCandidates } from "@/lib/elections/endedResultsCandidates";
import { selectGeneralPhaseDisplayCandidates } from "@/lib/elections/generalPhaseCandidates";

import { loadApportionment } from "@/lib/elections/apportionment";

import type {
  ElectionResponse,
  ResolveElectionOptions,
  ElectionDeps,
  SnapshotEntry,
  GeneralVotesData,
} from "./electionResponseTypes";
import { buildPollingData, computeSeatEstimates } from "./buildPollingData";
import { resolvedSeatsEstimate } from "./resolvedSeatsEstimate";
import { appendHistoricalTallyCandidates } from "./historicalTallyCandidates";

import { getPartyHex } from "@/lib/utils/politics";

import { getPrimaryWaveSchedule } from "@/lib/constants/primaryCalendar";
import { presidentialRulesetFor } from "@/lib/elections/presidentialRuleset";
import { buildActiveVisibleNppEndorsementFilter } from "@/lib/nppEndorsements";
import {
  ELECTION_SUMMARY_CHARACTER_PROJECTION,
  ELECTION_SUMMARY_NPP_PROJECTION,
} from "./electionSummaryProjections";
import { parseSeatId } from "@/lib/seats/seatId";

import { ballotSharesWithinParty } from "@/lib/turn/primaryBallots";

import { applyPresidentialPrimaryDisplay } from "./enrichPresidentialPrimaryDisplay";

import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { statesCollection } from "@/lib/db/repositories/states";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";
import { electionVoteTalliesCollection } from "@/lib/db/repositories/electionVoteTallies";
import { campaignsCollection } from "@/lib/db/repositories/campaigns";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";

import { playerEndorsementsCollection } from "@/lib/db/repositories/playerEndorsements";
import { nppEndorsementsCollection } from "@/lib/db/repositories/nppEndorsements";

import { congressionalDistrictsCollection } from "@/lib/db/repositories/congressionalDistricts";
import { primarySnapshotsCollection } from "@/lib/db/repositories/primarySnapshots";

async function prepare_enrichElection(
  election: Election,
  deps: ElectionDeps,
  options: ResolveElectionOptions,
  gameTime: GameTimeContext,
  gameState: GameState | null,
  db: Db,
  adjacentElections?: Array<{ _id: MongoObjectId; cycle: number; seatId?: string }> | null
) {
  const { view, userId, isAdmin = false, activeCharacterId } = options;
  const isFull = view === "full";
  const {
    candidates,
    characters,
    npps,
    parties,
    nppEndorsements,
    playerEndorsements,
    snapshots,
    statePartyOrgs,
    campaigns,
    tally,
    latestPrimarySnapshot,
  } = deps;
  applyStandingAds(
    candidates,
    new Map(characters.map((character) => [character._id.toString(), character]))
  );

  const electionOid = election._id;
  const countryId = election.countryId ?? "US";
  const isPresident = usesLegacyPresidentialCampaign(election);

  // Live apportionment: census-updated `state.houseDistricts` (preset seed
  // fallback). Equals the seed until a decennial census reapportions (P1d-2).
  const {
    electoralVotes: evByState,
    electoralVoteUnits: evUnits,
    houseSeats,
  } = deps.apportionment ??
  (await loadApportionment(db, gameState?.preset, gameState?.currentYear));

  // For state-level primary alignment, look up the cached lean of the seat's region.
  // Presidential races have no single regional electorate, so they skip this fetch.
  const electionSeatId = election.seatId ?? null;
  const localRegionId =
    !isPresident && electionSeatId ? parseSeatId(electionSeatId).localRegionId : null;
  let localRegionState: State | null | undefined;
  const statesForEnrichment = new Map<string, State>();
  if (localRegionId) {
    localRegionState =
      deps.localRegionState !== undefined
        ? deps.localRegionState
        : await statesCollection(db).findOne({ _id: localRegionId, countryId });
    if (localRegionState) statesForEnrichment.set(localRegionId, localRegionState);
  }

  // Phase
  const phase = computeElectionPhase(
    election.startTime ?? null,
    election.primaryEndTime ?? null,
    election.endTime ?? null,
    election.status,
    gameTime,
    {
      startTurn: election.startTurn,
      primaryEndTurn: election.primaryEndTurn,
      endTurn: election.endTurn,
    }
  );
  const { inPrimary, isEnded, isUpcoming, inGeneral } = phase;

  // Build char party map for display-party resolution (used by polling builder)
  const charPartyMap = new Map(characters.map((c) => [c._id.toString(), c.party]));

  // Enrich candidates. Ended races keep ballot-time party on labels/colours so
  // later party switches cannot recolour historical results.
  const enrichedCandidates = enrichElectionCandidates({
    candidates,
    characters,
    npps,
    parties,
    nppEndorsements,
    playerEndorsements,
    campaigns,
    statePartyOrgs,
    isPresident,
    myCharId: null, // isYou set separately below after myCharId lookup
    states: statesForEnrichment,
    electionSeatId,
    preferBallotParty: isEnded,
    includePrimaryScoreBreakdown: isFull && inPrimary && !isEnded,
  });

  // Determine current user's character ID. Multi-profile aware: prefer the
  // explicit activeCharacterId from auth when available, so users with
  // multiple characters don't get "isYou" mapped onto an arbitrary one.
  let myCharId: string | null = null;
  if (isFull && userId) {
    if (activeCharacterId) {
      myCharId = activeCharacterId;
    } else {
      const myChar = await getCharacterByUserId(db, userId);
      if (myChar) myCharId = myChar._id.toString();
    }
  } else if (userId && activeCharacterId) {
    // Summary rows carry no lookup, but the viewer's own candidacy must still
    // read as theirs, or list screens say the player is not in their race.
    myCharId = activeCharacterId;
  }

  // Re-mark isYou after myCharId is resolved
  const enrichedWithIsYou: EnrichedCandidate[] = enrichedCandidates.map((c) => ({
    ...c,
    isYou:
      !c.isNPP && c.characterId != null && myCharId != null
        ? // characterId in enriched candidates is already sequentialId; we need ObjectId match
          // Re-check using original candidates array for accuracy
          candidates.some(
            (raw) =>
              raw._id.toString() === c.id && !raw.isNPP && raw.characterId.toString() === myCharId
          )
        : false,
  }));

  // Phase B fog-of-war: strip `support` from candidate rows unless the
  // viewer is admin or has a candidate in this race. The PersuasionDrivers
  // card's supportDelta driver row falls back to neutral when Support is
  // undefined, so non-privileged viewers see a 0 row instead of inferring
  // opponent Support values from the engine math.
  const isViewerInRace = enrichedWithIsYou.some((c) => c.isYou);
  const supportPrivileged = isAdmin || isViewerInRace;
  const enrichedWithYou: EnrichedCandidate[] = supportPrivileged
    ? enrichedWithIsYou
    : enrichedWithIsYou.map((c) => ({ ...c, support: undefined }));

  // Group by the currently displayed party label; presidential primary display
  // may remap this later to the raw candidacy-party buckets for synchronization.
  const partyMap = new Map(parties.map((p) => [String(p.sequentialId), p]));
  let primaryCandidates = enrichedWithYou;
  if (inPrimary && !isPresident && candidates.some((candidate) => candidate.targetedAds?.length)) {
    const cells =
      deps.campaignCells !== undefined
        ? deps.campaignCells
        : election.state === election.countryId
          ? await loadNationalCampaignCells(
              db,
              election.countryId,
              election.campaignRulesVersion ?? 0
            )
          : (
              await loadCampaignAudience(
                db,
                election.countryId,
                election.state,
                undefined,
                election.campaignRulesVersion ?? 0,
                election.state === localRegionId && election.countryId === countryId
                  ? localRegionState
                  : undefined
              )
            )?.cells;
    if (cells?.length) {
      const rawById = new Map(candidates.map((candidate) => [candidate._id.toString(), candidate]));
      const ownerPositionById = new Map([
        ...characters.map((character) => [character._id.toString(), character.policies] as const),
        ...npps.map((npp) => [npp._id.toString(), npp.policies] as const),
      ]);
      primaryCandidates = enrichedWithYou.map((candidate) => {
        const raw = rawById.get(candidate.id);
        const position = raw
          ? ownerPositionById.get((raw.nppId ?? raw.characterId).toString())
          : undefined;
        if (!raw?.targetedAds?.length || !position || candidate.primaryScore == null)
          return candidate;
        const bonus = meanAdBonus(
          cells,
          targetedAdBonuses(
            cells,
            { economicLean: position.economic, socialLean: position.social },
            raw.targetedAds,
            election.state,
            gameTime.currentTurn
          )
        );
        const primaryScore = campaignPrimaryScore(
          candidate.primaryScore,
          bonus,
          PRIMARY_SHARE_SOFTMAX_TEMPERATURE
        );
        return {
          ...candidate,
          primaryScore,
          ...(candidate.primaryScoreBreakdown && {
            primaryScoreBreakdown: {
              ...candidate.primaryScoreBreakdown,
              campaignAdjustment: primaryScore - candidate.primaryScore,
              score: primaryScore,
            },
          }),
        };
      });
    }
  }
  let byParty = groupCandidatesByParty(primaryCandidates, partyMap);
  if (inPrimary && !isPresident) {
    for (const group of byParty) group.primaryShareBasis = "estimate";
  }

  // Ballot-consistent primary standings: where the primary has accrued real
  // ballots (see recordPrimarySnapshots), the live page shows CUMULATIVE
  // ballot shares — the figure resolution will actually pick the nominee from
  // — instead of the instantaneous score softmax. Parties without ballots
  // (missing registration data, legacy races) keep the score shares.
  if (inPrimary && !isPresident && tally?.primaryVotes) {
    const primaryVotes = tally.primaryVotes;
    for (const group of byParty) {
      const shares = ballotSharesWithinParty(
        group.candidates.map((c) => c.id),
        primaryVotes
      );
      if (!shares) continue;
      group.primaryShareBasis = "counted";
      for (const groupCandidate of group.candidates) {
        groupCandidate.sharePct = shares.get(groupCandidate.id) ?? groupCandidate.sharePct;
        groupCandidate.primaryVotesCounted = primaryVotes[groupCandidate.id] ?? 0;
      }
      group.candidates.sort((a, b) => (primaryVotes[b.id] ?? 0) - (primaryVotes[a.id] ?? 0));
    }
  }

  // Primary-winner cap for this race: US=1, UK=3, JP=3; single-winner
  // governor/president races are always 1. Resolved once here and returned as
  // `primaryAdvanceCount` so client surfaces read it instead of recomputing it.
  const primaryAdvanceCount =
    hu1991PrimaryAdvanceLimit(election, enrichedWithYou.length) ??
    russianAssemblyPrimaryAdvanceLimit(election, enrichedWithYou.length) ??
    getPrimaryWinnersForElection(countryId as CountryId, election.electionType);

  // Display candidates: post-primary dedup, up to `primaryAdvanceCount`
  // per party. Covers the window between primaryEndTime and primary
  // resolution, and multi-advance races. Always include the current user's
  // candidate even if they lost the primary.
  let displayCandidates: EnrichedCandidate[] = primaryCandidates;
  if (!inPrimary && !isEnded) {
    displayCandidates = selectGeneralPhaseDisplayCandidates(enrichedWithYou, primaryAdvanceCount);
  } else if (isEnded) {
    // Final results show the field that actually contested the general. Ended
    // elections fetch ALL candidacies (active + withdrawn) so the primary field
    // is visible mid-race. Resolution withdraws EVERY candidate as cleanup, so
    // withdrawn-status can't distinguish a real contestant from a primary loser
    // / pre-general drop-out — pick by final-tally votes instead (falls back to
    // dropping withdrawn rows when no tally votes exist). See
    // selectEndedDisplayCandidates.
    const withdrawnIds = new Set(
      candidates.filter((c) => c.status === "withdrawn").map((c) => c._id.toString())
    );
    displayCandidates = selectEndedDisplayCandidates(
      enrichedWithYou,
      withdrawnIds,
      tally?.totalVotes
    );
  }

  // Defensive: never show the same character twice in one election's results.
  // The partial unique index on { characterId } (status:"active") can be
  // bypassed when a prior candidacy is withdrawn, leaving two rows for one
  // character; collapse to the first occurrence so duplicates never render.
  {
    const rawById = new Map(candidates.map((c) => [c._id.toString(), c]));
    const seenCharIds = new Set<string>();
    displayCandidates = displayCandidates.filter((c) => {
      const charId = rawById.get(c.id)?.characterId?.toString();
      if (!charId) return true;
      if (seenCharIds.has(charId)) return false;
      seenCharIds.add(charId);
      return true;
    });
  }

  // A finished election must render the same field forever, even after a
  // contestant's character, NPP or candidacy row is deleted (a party merge does
  // this), so missing rows are rebuilt from the tally's name, party and votes.
  // Only when ended: in a live race a missing candidacy is a real withdrawal.
  if (isEnded) {
    displayCandidates = appendHistoricalTallyCandidates(displayCandidates, tally, (partyId) => {
      const partyObj = partyMap.get(partyId);
      return {
        name: partyObj?.name ?? "Unknown Party",
        color: getPartyHex(partyId, partyObj?.color),
        econ: partyObj?.economicPosition ?? 0,
        social: partyObj?.socialPosition ?? 0,
      };
    });
  }

  // Active candidates (for polling). For an ended race this set also decides
  // which votes survive `filterRecord` below, so the restored rows above keep
  // the published denominator intact.
  const activeCandidateIdSet = new Set(displayCandidates.map((c) => c.id));
  const activeCandidates = candidates.filter((c) => activeCandidateIdSet.has(c._id.toString()));

  // Rows restored from the tally have no candidacy document, so they are absent
  // from `activeCandidates`. Polling must still see them or its donut rescales
  // to a survivors-only denominator while the results panel uses the published
  // one — the same race reading 37.1% on the election card and 32.4% on its
  // detail page. Structural rows are enough; polling needs only these fields.
  const pollingCandidates = [
    ...activeCandidates,
    ...displayCandidates
      .filter((c) => !activeCandidates.some((a) => a._id.toString() === c.id))
      .map((c) => ({
        _id: c.id,
        characterId: null,
        characterName: c.characterName,
        party: c.party,
        isNPP: c.isNPP,
      })),
  ];

  // Polling data (always computed for both views).
  // Ended races: omit live character.party so polling colours stay on the
  // candidacy-row (ballot) party, same historical rule as map colours.
  // Primary: pass live byParty shares so party/list cards match the detail
  // page rather than snapshot shares.
  let polling = buildPollingData(
    election.electionType,
    countryId,
    inPrimary,
    pollingCandidates,
    parties,
    tally,
    latestPrimarySnapshot,
    isEnded ? new Map() : charPartyMap,
    inPrimary ? byParty : null
  );

  // Seat estimates (always computed for multi-seat races, needed by both views).
  // A RESOLVED race must show the allocation it actually seated, never a
  // fresh recompute. Recomputing on every load meant a finished election
  // rendered a different result whenever an allocator input drifted underneath
  // it — a player held 7 seats while this page showed 16. `generalResolution`
  // already persists the authoritative allocation on the tally, so when it is
  // there every projection path below is skipped: the persisted value wins, and
  // the districted branch's database round-trip is spared on a settled race.
  const seatedAllocation = resolvedSeatsEstimate(tally, null);

  const isBgOrdinary =
    gameState?.preset === "1991-default" &&
    countryHasFeature("bgElections", election.countryId) &&
    election.electionType === "nationalAssembly" &&
    (election.cycle >= 1 || election.bulgarianFoundingRound != null);
  const isHu1991Pending =
    countryHasFeature("huElections", election.countryId) &&
    election.electionType === "nationalAssembly" &&
    (election.hungarianAssemblyRound?.ruleVersion === "mixed-1989-v1" ||
      election.hungarianModernByElection != null ||
      election.hungarianModernAssembly != null);
  let seatsEstimate =
    seatedAllocation ??
    (isBgOrdinary || isHu1991Pending
      ? null
      : computeSeatEstimates(
          election.electionType,
          election.totalSeats,
          tally,
          activeCandidateIdSet,
          election.countryId ?? "US",
          election.allocationMethod,
          election.state
        ));

  // US House: project seats district by district with the engine that decides the
  // final result, so the live panel matches the race. Falls back to the
  // proportional estimate above when no districts are drawn.
  const redistrictedHouseRace =
    election.electionType === "house" && countryHasFeature("usElections", countryId ?? "US");
  let districtsForState: CongressionalDistrict[] | null = null;
  let districtedMarginProjection: SeatProjection | null = null;
  if (redistrictedHouseRace && !seatedAllocation && tally) {
    const candidateVotes: Record<string, number> = {};
    const candidateParty: Record<string, string> = {};
    for (const c of activeCandidates) {
      const id = c._id.toString();
      candidateVotes[id] = tally.totalVotes?.[id] ?? 0;
      candidateParty[id] = c.party ?? tally.candidateParties?.[id] ?? "";
    }
    const districts = deps.preloadedDistricts
      ? deps.preloadedDistricts.filter((d) => d.stateId === election.state)
      : await congressionalDistrictsCollection(db)
          .find({ countryId: "US", stateId: election.state as string })
          .toArray();
    districtsForState = districts;
    if (districts.length > 0) {
      const projectionInput = {
        countryId: "US",
        candidateParty,
        primaryShares: buildPrimaryShareMap(tally.primaryResults ?? null),
        districtBoosts: (
          election as { districtCampaignBoosts?: Record<string, Record<string, number>> }
        ).districtCampaignBoosts,
        districts,
        parties,
      };
      const projection = projectDistrictedSeats({ ...projectionInput, candidateVotes });
      if (
        projection?.result.seatsEstimate &&
        Object.keys(projection.result.seatsEstimate).length > 0
      ) {
        seatsEstimate = projection.result.seatsEstimate;
        // The same engine answers the votes-to-next-seat line, so the margin
        // reflects the seats this race will actually resolve with.
        districtedMarginProjection = (votes) =>
          projectDistrictedSeats({ ...projectionInput, candidateVotes: votes })?.result
            .seatsEstimate ?? null;
      }
    }
  }

  // The resolver falls back to the statewide allocator when a state has no
  // districts drawn, so the race page must not claim district seats there. Ended
  // races skip the projection above; a one-document check settles those without
  // loading the whole state's districts.
  if (redistrictedHouseRace && districtsForState === null && isFull) {
    districtsForState = await congressionalDistrictsCollection(db)
      .find({ countryId: "US", stateId: election.state as string })
      .limit(1)
      .toArray();
  }
  const seatsDecidedByDistrict = redistrictedHouseRace && (districtsForState?.length ?? 0) > 0;

  // National Front chambers: project with the SAME quota the resolver will use,
  // for the same reason the districted branch above exists. `computeSeatEstimates`
  // has no bloc-list whitelist entry and returns null here, so before this the
  // DDR showed a cross-party vote pie and no seat projection at all. That pie is
  // the most misleading surface in the game for a bloc list: it invites players
  // to read a popular bloc party as a chamber-winning one when the quota means
  // it can never be. Overriding caller-side keeps the shared helper's signature
  // and its other two call sites untouched.
  const blocCountry = countryId ?? election.countryId;
  // Skipped for a resolved race: the seated allocation already IS the
  // bloc-list result the resolver produced, and short-circuiting here also
  // spares the `getCountryState` round-trip below.
  const configuredBlocQuota =
    !seatedAllocation && MULTI_SEAT_TYPES.has(election.electionType)
      ? blocListQuota(blocCountry)
      : null;
  const blocQuota = configuredBlocQuota
    ? blocListQuotaForGovernment(
        blocCountry,
        (await getCountryState(db, blocCountry)).governmentType
      )
    : null;
  if (blocQuota && election.totalSeats) {
    const ranked = activeCandidates
      .map((c) => {
        const id = c._id.toString();
        return {
          id,
          votes: tally?.totalVotes?.[id] ?? 0,
          party: c.party ?? tally?.candidateParties?.[id] ?? undefined,
        };
      })
      .sort((a, b) => b.votes - a.votes || (a.id < b.id ? -1 : 1));
    if (ranked.length > 0) {
      seatsEstimate = allocateBlocListSeats(election.totalSeats, blocQuota.shares, ranked);
    }
  }

  // Votes to gain or lose a seat. Standard-allocator races project through the
  // same allocator the page shows; districted US House races use the district
  // engine, so the line reflects the seats actually at stake there too.
  const projectedByAllocator =
    !districtedMarginProjection &&
    !seatedAllocation &&
    !isBgOrdinary &&
    !isHu1991Pending &&
    !(blocQuota && election.totalSeats) &&
    seatsEstimate != null &&
    tally != null;
  const marginProjection: SeatProjection | null = districtedMarginProjection
    ? districtedMarginProjection
    : projectedByAllocator && tally
      ? (votes) =>
          computeSeatEstimates(
            election.electionType,
            election.totalSeats,
            { ...tally, totalVotes: votes },
            activeCandidateIdSet,
            election.countryId ?? "US",
            election.allocationMethod,
            election.state
          )
      : null;
  const seatMargins =
    marginProjection && tally && !tally.finalized && tally.countingMethod !== "pr_stv"
      ? computeSeatMargins(
          marginProjection,
          Object.fromEntries(
            [...activeCandidateIdSet].map((id) => [id, tally.totalVotes?.[id] ?? 0])
          )
        )
      : null;

  // ----- Full-view only fields -----
  let prevElectionId: string | null = null;
  let nextElectionId: string | null = null;
  let snapshotHistory: SnapshotEntry[] | null = null;
  let generalVotes: GeneralVotesData | null = null;
  let myEndorsedCandidateId: string | null = null;
  let myPartyId: string | null = null;
  let myCampaignId: string | null = null;
  /** Read-through of the tally's economic-referendum snapshot (president only). */
  let economicReferendum: ElectionResponse["economicReferendum"];
  /** Read-through of the tally's factor ledger, fog-of-war applied (president only). */
  let factorLedger: ElectionResponse["factorLedger"];
  /** Read-through of the tally's democratic-health pressure snapshot (president only). */
  let democraticHealth: ElectionResponse["democraticHealth"];
  /** Presidential-primary stagger calendar with each wave's live status. */
  let primaryCalendar: PrimaryCalendarWave[] | undefined;

  if (isPresident && inPrimary) {
    const projectedDisplay = await applyPresidentialPrimaryDisplay(
      db,
      countryId,
      candidates,
      characters,
      npps,
      parties,
      tally,
      byParty,
      polling,
      statePartyOrgs,
      getPrimaryWaveSchedule(presidentialRulesetFor(election)),
      gameState?.preset,
      election.campaignRulesVersion
    );
    byParty = projectedDisplay.byParty;
    polling = projectedDisplay.polling;
    displayCandidates = projectedDisplay.displayCandidates;
    primaryCalendar = projectedDisplay.primaryCalendar;
  }
  return {
    kind: "context" as const,
    context: {
      activeCandidateIdSet,
      adjacentElections,
      candidates,
      countryId,
      db,
      get democraticHealth() {
        return democraticHealth;
      },
      set democraticHealth(value: typeof democraticHealth) {
        democraticHealth = value;
      },
      deps,
      displayCandidates,
      get economicReferendum() {
        return economicReferendum;
      },
      set economicReferendum(value: typeof economicReferendum) {
        economicReferendum = value;
      },
      election,
      electionOid,
      enrichedWithIsYou,
      enrichedWithYou,
      evByState,
      evUnits,
      get factorLedger() {
        return factorLedger;
      },
      set factorLedger(value: typeof factorLedger) {
        factorLedger = value;
      },
      gameState,
      gameTime,
      get generalVotes() {
        return generalVotes;
      },
      set generalVotes(value: typeof generalVotes) {
        generalVotes = value;
      },
      houseSeats,
      inGeneral,
      inPrimary,
      isAdmin,
      isBgOrdinary,
      isEnded,
      isFull,
      isHu1991Pending,
      isPresident,
      get myCampaignId() {
        return myCampaignId;
      },
      set myCampaignId(value: typeof myCampaignId) {
        myCampaignId = value;
      },
      myCharId,
      get myEndorsedCandidateId() {
        return myEndorsedCandidateId;
      },
      set myEndorsedCandidateId(value: typeof myEndorsedCandidateId) {
        myEndorsedCandidateId = value;
      },
      get myPartyId() {
        return myPartyId;
      },
      set myPartyId(value: typeof myPartyId) {
        myPartyId = value;
      },
      get nextElectionId() {
        return nextElectionId;
      },
      set nextElectionId(value: typeof nextElectionId) {
        nextElectionId = value;
      },
      parties,
      partyMap,
      playerEndorsements,
      get prevElectionId() {
        return prevElectionId;
      },
      set prevElectionId(value: typeof prevElectionId) {
        prevElectionId = value;
      },
      primaryCalendar,
      primaryCandidates,
      seatMargins,
      seatsDecidedByDistrict,
      get snapshotHistory() {
        return snapshotHistory;
      },
      set snapshotHistory(value: typeof snapshotHistory) {
        snapshotHistory = value;
      },
      snapshots,
      statePartyOrgs,
      statesForEnrichment,
      tally,
      userId,
      seatsEstimate,
      isUpcoming,
      primaryAdvanceCount,
      byParty,
      polling,
    },
  };
}
export type _enrichElectionStageContext = Extract<
  Awaited<ReturnType<typeof prepare_enrichElection>>,
  { kind: "context" }
>["context"];

export async function _enrichElection(
  ...args: Parameters<typeof prepare_enrichElection>
): Promise<ElectionResponse> {
  const prepared = await prepare_enrichElection(...args);
  return enrichElectionResults(prepared.context);
}

// ---------------------------------------------------------------------------
// Dependency fetcher for a single election
// ---------------------------------------------------------------------------

export async function fetchDepsForElection(
  db: Db,
  election: Election,
  view: "full" | "summary"
): Promise<ElectionDeps> {
  const electionOid = election._id;
  const isFull = view === "full";
  const isPresident = election.electionType === "president";
  const countryId = election.countryId ?? "US";

  const candidateQuery: Record<string, unknown> = { electionId: electionOid };
  if (election.status !== "completed" && election.status !== "resolved") {
    candidateQuery.status = "active";
  }
  const candidates = await electionCandidatesCollection(db).find(candidateQuery).toArray();

  const characterIds = candidates.filter((c) => !c.isNPP).map((c) => c.characterId);
  const runningMateIds = candidates.filter((c) => c.runningMateId).map((c) => c.runningMateId!);
  const allCharIds = [
    ...new Set([...characterIds, ...runningMateIds].map((id) => id.toString())),
  ].map((s) => new ObjectId(s));
  const nppIds = [
    ...new Set(
      candidates.flatMap((candidate) => [
        ...(candidate.isNPP && candidate.nppId ? [candidate.nppId.toString()] : []),
        ...(candidate.russianRunningMateNppId
          ? [candidate.russianRunningMateNppId.toString()]
          : []),
      ])
    ),
  ].map((id) => new ObjectId(id));

  // Parallel fetches (core data always; endorsements/campaigns only for full view).
  // Summary views project the candidate-batch reads: NPPs drop the
  // ~30KB stance map, characters keep the closed display/scoring set, and
  // full view keeps whole documents. See electionSummaryProjections.ts.
  const [
    characters,
    npps,
    parties,
    nppEndorsements,
    playerEndorsements,
    snapshots,
    statePartyOrgs,
    campaigns,
    tally,
  ] = await Promise.all([
    allCharIds.length > 0
      ? charactersCollection(db)
          .find(
            { _id: { $in: allCharIds } },
            isFull ? undefined : { projection: ELECTION_SUMMARY_CHARACTER_PROJECTION }
          )
          .toArray()
      : Promise.resolve([] as Character[]),
    nppIds.length > 0
      ? nppsCollection(db)
          .find(
            { _id: { $in: nppIds } },
            isFull ? undefined : { projection: ELECTION_SUMMARY_NPP_PROJECTION }
          )
          .toArray()
      : Promise.resolve([] as NPP[]),
    politicalPartiesCollection(db).find({ countryId }).toArray(),
    isFull
      ? nppEndorsementsCollection(db)
          .find(buildActiveVisibleNppEndorsementFilter({ electionId: electionOid }))
          .toArray()
      : Promise.resolve([] as NPPEndorsement[]),
    isFull
      ? playerEndorsementsCollection(db).find({ electionId: electionOid, isActive: true }).toArray()
      : Promise.resolve([] as PlayerEndorsement[]),
    isFull
      ? primarySnapshotsCollection(db)
          .find({ electionId: electionOid })
          .sort({ recordedAt: 1 })
          .limit(144)
          .toArray()
          // A split turn holds an early and a rest row; chart one per turn.
          .then((rows) => oneRowPerTurn(rows).slice(0, 72))
      : Promise.resolve([] as PrimarySnapshot[]),
    isFull && isPresident
      ? statePartyOrgCollection(db).find({}).toArray()
      : Promise.resolve([] as StatePartyOrg[]),
    isFull
      ? campaignsCollection(db)
          .find(
            { electionId: electionOid },
            {
              projection: {
                _id: 1,
                candidateId: 1,
                funds: 1,
                color: 1,
                campaignStrength: 1,
              },
            }
          )
          .toArray()
      : Promise.resolve([] as Campaign[]),
    electionVoteTalliesCollection(db).findOne({ electionId: electionOid }),
  ]);

  // Latest primary snapshot — trend charts (full view) + fallback when live
  // primary groups are not available. Card/list polling % now uses live
  // byParty shares (ticket-1022).
  let latestPrimarySnapshot: PrimarySnapshot | null = null;
  if (snapshots.length > 0) {
    latestPrimarySnapshot = snapshots[snapshots.length - 1];
  } else {
    // summary mode (snapshots array is empty) — fetch the single latest
    const latest = await primarySnapshotsCollection(db)
      .find({ electionId: electionOid })
      .sort({ recordedAt: -1 })
      .limit(1)
      .toArray();
    latestPrimarySnapshot = latest[0] ?? null;
  }

  // Incumbent lookup for single-seat races
  const SINGLE_SEAT_TYPES = new Set([
    "senate",
    "governor",
    "president",
    "primeMinister",
    "uachtaran",
  ]);
  let incumbent: { name: string; partyId: string } | null = null;
  if (SINGLE_SEAT_TYPES.has(election.electionType)) {
    const isNational =
      election.electionType === "president" ||
      election.electionType === "primeMinister" ||
      election.electionType === "uachtaran";
    const q: Record<string, unknown> = {
      ...(countryId === COUNTRY_CONFIGS.US.id
        ? { $or: [{ countryId: COUNTRY_CONFIGS.US.id }, { countryId: null }] }
        : { countryId }),
      "currentOffice.type": election.electionType,
    };
    if (!isNational) q["currentOffice.state"] = election.state;
    if (election.electionType === "senate" && election.senateClass != null) {
      q["currentOffice.senateClass"] = election.senateClass;
    }
    const [incumbentChar, incumbentNPP] = await Promise.all([
      charactersCollection(db).findOne(q, { projection: { name: 1, party: 1 } }),
      nppsCollection(db).findOne(q, { projection: { name: 1, party: 1 } }),
    ]);
    const holder = incumbentChar ?? incumbentNPP;
    if (holder) incumbent = { name: holder.name, partyId: holder.party };
  }

  return {
    candidates,
    characters,
    npps,
    parties,
    nppEndorsements,
    playerEndorsements,
    snapshots,
    statePartyOrgs,
    campaigns,
    tally,
    latestPrimarySnapshot,
    incumbent,
  };
}
