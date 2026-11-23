import { finishedPrimaryResults } from "@/lib/elections/finishedPrimaryResults";
import { resolveElectionYear } from "@/lib/utils/formatters";

import { cycleAnchorContextFromGameState } from "@/lib/elections/cycleAnchorContext";

import { eraYearContextFromGameState } from "@/lib/era/context";
import { censusMedianVoter } from "@/lib/elections/censusMedianVoter";
import { ObjectId } from "mongodb";
import type { StateDemographics } from "@/lib/db/types";
import { getRegionalExecutiveOfficeKey, type CountryId } from "@/lib/constants/countries";
import {
  isHeadOfGovernmentRace,
  resolvePresidentApproval,
  buildPresidentialModifierByParty,
  presidentialModifierToPct,
} from "@/lib/elections/engine/presidentialCoattail";
import {
  buildGovModifierByParty,
  govModifierToPct,
  resolveGovExecutiveApproval,
  isCoattailEligibleRace,
  isOwnRegionalExecutiveRace,
} from "@/lib/elections/engine/govCoattail";

import { applyFactorLedgerFogOfWar } from "@/lib/elections/factorLedgerFog";

import { getOrCreateVoteTally } from "@/lib/elections/voteTallyService";

import { computeElectoralVotes } from "@/lib/elections/electoralVoteService";
import { getFundsByPartyForElection } from "@/lib/elections/engine/fundsByParty";
import { getIncumbentSeatShareByParty } from "@/lib/elections/engine/incumbentSeatShare";
import { capIncumbentSeatShares } from "@/lib/parties/rules/partyRenewal";
import {
  resolveSingleSeatLegislativeIncumbent,
  isSingleSeatLegislativeRace,
} from "@/lib/elections/engine/singleSeatIncumbency";
import { usesEvWeightedNationalMedian } from "@/lib/elections/engine/medianVoter";

import {
  buildMidtermOppositionModifierByParty,
  isMidtermOppositionBoostEligible,
  midtermOppositionModifierToPct,
} from "@/lib/elections/engine/midtermOppositionBoost";
import { resolveGoverningPartyIds } from "@/lib/government/governingPartyIds";
import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import { incumbentCandidacy } from "@/lib/elections/rules/incumbentCandidacy";

import { seatEstimateForVoteTotals } from "@/lib/elections/snapshotSeats";
import { getPartyHex } from "@/lib/utils/politics";
import { findViewerRaceCampaignId } from "@/lib/campaigns/queries/viewerRaceCampaign";

import { parseSeatId } from "@/lib/seats/seatId";
import {
  buildPartyDisplayById,
  buildPresidentialRegByStateInput,
} from "@/lib/elections/presidentialRegByState";

import { resolveElectionDisplayParty } from "@/lib/elections/resolveElectionParty";

import { projectContingentElection } from "@/lib/elections/contingentProjection";
import {
  PRESIDENTIAL_EV_NEEDED,
  collegeSizeFromEvByState,
  electoralMajorityFor,
} from "@/lib/elections/presidentialResolutionDisplay";

import { charactersCollection } from "@/lib/db/repositories/characters";

import { stateDemographicsCollection } from "@/lib/db/repositories/stateDemographics";

import { demographicDefaultsCollection } from "@/lib/db/repositories/demographicDefaults";
import { stateRegistrationPoolCollection } from "@/lib/db/repositories/stateRegistrationPool";

import type { _enrichElectionStageContext } from "@/lib/elections/enrichElection";

export async function enrichElectionResults(
  context: _enrichElectionStageContext
): Promise<ElectionResponse> {
  if (context.isFull) {
    // Prev/next navigation
    if (context.adjacentElections && context.adjacentElections.length > 0) {
      const idx = context.adjacentElections.findIndex((e) => e._id.equals(context.electionOid));
      if (idx > 0) {
        const prev = context.adjacentElections[idx - 1];
        context.prevElectionId = prev.seatId
          ? `${prev.seatId}?cycle=${prev.cycle}`
          : prev._id.toString();
      }
      if (idx >= 0 && idx < context.adjacentElections.length - 1) {
        const next = context.adjacentElections[idx + 1];
        context.nextElectionId = next.seatId
          ? `${next.seatId}?cycle=${next.cycle}`
          : next._id.toString();
      }
    }

    // Snapshot history
    context.snapshotHistory = context.snapshots.map((s) => ({
      recordedAt: s.recordedAt,
      byParty: s.byParty,
    }));

    // User endorsement
    if (context.myCharId) {
      context.myEndorsedCandidateId =
        context.playerEndorsements
          .find((e) => e.characterId.toString() === context.myCharId)
          ?.candidateId.toString() ?? null;
    }

    // The reader's own campaign in a presidential race (candidate, manager or
    // running mate), so the race page can open it in Campaign mode.
    if (context.userId && context.isPresident) {
      context.myCampaignId = await findViewerRaceCampaignId(
        context.db,
        context.electionOid,
        context.userId
      );
    }

    // The reader's party, so a primary screen offers endorsement only for
    // own-party candidates. Presidential primaries only.
    if (
      context.myCharId &&
      context.isPresident &&
      context.inPrimary &&
      ObjectId.isValid(context.myCharId)
    ) {
      const me = await charactersCollection(context.db).findOne(
        { _id: new ObjectId(context.myCharId) },
        { projection: { party: 1 } }
      );
      context.myPartyId = me?.party ?? null;
    }

    // Vote tally
    const resolvedTally = await getOrCreateVoteTally(
      context.db,
      context.electionOid,
      context.election,
      context.candidates,
      context.displayCandidates,
      context.inPrimary,
      context.isEnded
    );

    if (resolvedTally) {
      // National Mood gauge input. Pass-through of what the presidential engine
      // recorded on its last accumulation turn; the shift is already inside the
      // vote totals, so nothing here re-applies it. Party name/colour are the
      // only additions, resolved for display.
      const referendumSnapshot =
        resolvedTally.economicReferendum ?? context.tally?.economicReferendum;
      if (context.isPresident && referendumSnapshot) {
        const referendumParty = referendumSnapshot.incumbentPartyId
          ? context.partyMap.get(String(referendumSnapshot.incumbentPartyId))
          : undefined;
        context.economicReferendum = {
          miseryIndex: referendumSnapshot.miseryIndex,
          sharePts: referendumSnapshot.sharePts,
          components: referendumSnapshot.components.map((c) => ({
            key: c.key,
            label: c.label,
            contributionPts: c.contributionPts,
          })),
          fatigueMultiplier: referendumSnapshot.fatigueMultiplier,
          recordedTurn: referendumSnapshot.recordedTurn,
          ...(referendumSnapshot.forgivenessFrac
            ? {
                forgivenessFrac: referendumSnapshot.forgivenessFrac,
                creditedBills: (referendumSnapshot.creditedBills ?? []).map((b) => ({
                  key: b.key,
                  title: b.title,
                  component: b.component,
                  weight: b.weight,
                })),
              }
            : {}),
          ...(referendumSnapshot.incumbentPartyId
            ? { incumbentPartyId: referendumSnapshot.incumbentPartyId }
            : {}),
          ...(referendumParty?.name ? { incumbentPartyName: referendumParty.name } : {}),
          ...(referendumParty?.color ? { incumbentPartyColor: referendumParty.color } : {}),
        };
      }

      const democraticHealthSnapshot =
        resolvedTally.democraticHealth ?? context.tally?.democraticHealth;
      if (context.isPresident && democraticHealthSnapshot) {
        const rulingParty = democraticHealthSnapshot.rulingPartyId
          ? context.partyMap.get(String(democraticHealthSnapshot.rulingPartyId))
          : undefined;
        context.democraticHealth = {
          ...democraticHealthSnapshot,
          ...(rulingParty?.name ? { rulingPartyName: rulingParty.name } : {}),
          ...(rulingParty?.color ? { rulingPartyColor: rulingParty.color } : {}),
        };
      }

      // Factor Ledger card input. Read straight off the tally (never recomputed).
      // Fog-of-war: the national factor waterfall is public for every candidate,
      // but per-candidate `bucketAppeal` (where a candidate's appeal comes from)
      // and the per-unit breakdown are stripped for candidates the viewer does
      // not own, matching the Support fog on the persuasion card. Admins see all.
      const factorLedgerSnapshot = resolvedTally.factorLedger ?? context.tally?.factorLedger;
      if (context.isPresident && factorLedgerSnapshot) {
        const ownedCandidateIds = new Set(
          context.isAdmin
            ? factorLedgerSnapshot.byCandidateNational.map((c) => c.candidateId)
            : context.enrichedWithIsYou.filter((c) => c.isYou).map((c) => c.id)
        );
        context.factorLedger = applyFactorLedgerFogOfWar(factorLedgerSnapshot, ownedCandidateIds);
      }

      const filterRecord = <T>(rec: Record<string, T>): Record<string, T> => {
        const out: Record<string, T> = {};
        for (const [k, v] of Object.entries(rec)) {
          if (context.activeCandidateIdSet.has(k)) out[k] = v;
        }
        return out;
      };

      // Electoral votes (president only). For historical races, overlay
      // ballot-time parties onto the tally so EV map colours never fall back
      // to a missing snapshot key while the battleground map uses ballot party.
      let electoralVotesResult = {};
      if (context.isPresident) {
        const candidateNameMap = new Map(
          context.enrichedWithYou.map((c) => [c.id, c.characterName])
        );
        const preferElectionTimeParty = context.isEnded || resolvedTally.finalized === true;
        let tallyForEv: typeof resolvedTally = resolvedTally;
        if (preferElectionTimeParty) {
          const mergedParties: Record<string, string> = {
            ...(resolvedTally.candidateParties ?? {}),
          };
          for (const c of context.candidates) {
            const cid = c._id.toString();
            if (!mergedParties[cid]) mergedParties[cid] = c.party;
          }
          tallyForEv = { ...resolvedTally, candidateParties: mergedParties };
        }
        electoralVotesResult = await computeElectoralVotes(
          context.db,
          tallyForEv,
          candidateNameMap,
          context.partyMap,
          context.evUnits
        );
      }

      // Candidate names/parties/colours must cover ALL candidates that appear in
      // state-level or historical data, not just active display candidates.
      // Presidential unit-level tallies may retain votes from withdrawn/primary
      // candidates, and those candidates must still render with a name.
      const referencedCandidateIds = new Set<string>(context.activeCandidateIdSet);
      for (const cid of Object.keys(resolvedTally.candidateNames ?? {})) {
        referencedCandidateIds.add(cid);
      }
      if (context.isPresident) {
        const evr = electoralVotesResult as {
          stateVoteData?: Record<
            string,
            { votesByCandidate: Record<string, number>; evByCandidate: Record<string, number> }
          >;
          stateVotesOverTime?: Record<string, Array<{ cumulativeVotes: Record<string, number> }>>;
          evByTurn?: Array<{ electoralVotesByCandidate: Record<string, number> }>;
        };
        if (evr.stateVoteData) {
          for (const data of Object.values(evr.stateVoteData)) {
            for (const cid of Object.keys(data.votesByCandidate)) referencedCandidateIds.add(cid);
            for (const cid of Object.keys(data.evByCandidate)) referencedCandidateIds.add(cid);
          }
        }
        if (evr.stateVotesOverTime) {
          for (const snaps of Object.values(evr.stateVotesOverTime)) {
            for (const snap of snaps) {
              for (const cid of Object.keys(snap.cumulativeVotes)) referencedCandidateIds.add(cid);
            }
          }
        }
        if (evr.evByTurn) {
          for (const point of evr.evByTurn) {
            for (const cid of Object.keys(point.electoralVotesByCandidate))
              referencedCandidateIds.add(cid);
          }
        }
      }

      const fullCandidateNames: Record<string, string> = {};
      const fullCandidateParties: Record<string, string> = {};
      const candidateIsNPP = {
        ...Object.fromEntries(
          context.candidates.map((candidate) => [
            candidate._id.toString(),
            Boolean(candidate.isNPP),
          ])
        ),
        ...resolvedTally.candidateIsNPP,
      };
      // For ended elections, prefer the tally snapshot, then the
      // candidacy-row party, never the live character.party, so historical
      // maps keep election-time colours. In-progress races use live party.
      const preferElectionTimeParty = context.isEnded || resolvedTally.finalized === true;
      const ballotPartyById = new Map(context.candidates.map((c) => [c._id.toString(), c.party]));
      for (const cid of referencedCandidateIds) {
        const enriched = context.enrichedWithYou.find((c) => c.id === cid);
        fullCandidateNames[cid] =
          enriched?.characterName ?? resolvedTally.candidateNames?.[cid] ?? "Unknown";
        fullCandidateParties[cid] = resolveElectionDisplayParty({
          preferElectionTimeParty,
          snapshotParty: resolvedTally.candidateParties?.[cid],
          ballotParty: ballotPartyById.get(cid),
          liveParty: enriched?.party,
        });
      }
      const fullCandidateColors: Record<string, string> = {};
      for (const [cid, pid] of Object.entries(fullCandidateParties)) {
        const partyObj = context.partyMap.get(pid);
        fullCandidateColors[cid] = getPartyHex(pid, partyObj?.color);
      }

      context.generalVotes = {
        totalVotes: filterRecord(resolvedTally.totalVotes),
        candidateNames: fullCandidateNames,
        candidateParties: fullCandidateParties,
        candidateColors: fullCandidateColors,
        finalized: resolvedTally.finalized,
        seatsEstimate: context.seatsEstimate,
        ...(context.seatMargins ? { seatMargins: context.seatMargins } : {}),
        turnSnapshots: resolvedTally.turnSnapshots.slice(-96).map((t) => {
          const persisted =
            t.seatsEstimate && Object.keys(t.seatsEstimate).length > 0
              ? t.seatsEstimate
              : undefined;
          const seatsEstimateSnapshot =
            context.isBgOrdinary || context.isHu1991Pending
              ? undefined
              : (persisted ??
                seatEstimateForVoteTotals(
                  context.election.electionType,
                  context.election.state,
                  context.election.totalSeats,
                  t.cumulativeVotes,
                  context.houseSeats,
                  fullCandidateParties,
                  context.election.countryId ?? "US",
                  context.election.allocationMethod,
                  candidateIsNPP
                ));
          return {
            turn: t.turn,
            recordedAt: t.recordedAt,
            cumulativeVotes: t.cumulativeVotes,
            sharesPct: t.sharesPct,
            ...(seatsEstimateSnapshot ? { seatsEstimate: seatsEstimateSnapshot } : {}),
            ...(t.participation ? { participation: t.participation } : {}),
          };
        }),
        ...electoralVotesResult,
        ...(resolvedTally.russianPresidentialResult
          ? { russianPresidentialResult: resolvedTally.russianPresidentialResult }
          : {}),
        // Per-state EV totals for the active preset (president display surfaces
        // read this instead of the 2020-census constant directly).
        ...(context.isPresident ? { evByState: context.evByState } : {}),
        ...(context.isPresident && resolvedTally.resolutionMode
          ? { resolutionMode: resolvedTally.resolutionMode }
          : {}),
        ...(context.isPresident && resolvedTally.contingentResult
          ? { contingentResult: resolvedTally.contingentResult }
          : {}),
        ...(context.isPresident && resolvedTally.contingentResolutionPending
          ? { contingentResolutionPending: true }
          : {}),
        ...(context.isPresident && resolvedTally.executiveSeatingPending
          ? { executiveSeatingPending: true }
          : {}),
      };

      // No projected EV majority: run the contingent ballot against the
      // Congress that would cast it, so the risk banner names who wins it.
      if (
        context.isPresident &&
        !context.isEnded &&
        context.generalVotes.electoralVotesByCandidate
      ) {
        const college = collegeSizeFromEvByState(context.evByState);
        const contingentProjection = await projectContingentElection(
          context.db,
          context.election,
          context.generalVotes.electoralVotesByCandidate,
          college > 0 ? electoralMajorityFor(college) : PRESIDENTIAL_EV_NEEDED,
          context.gameState
        );
        if (contingentProjection) context.generalVotes.contingentProjection = contingentProjection;
      }
    }
  }

  // Resolve incumbent display info from raw partyId → party name + color
  let incumbentDisplay: ElectionResponse["incumbent"] = null;
  if (context.deps.incumbent) {
    const incumbentParty = context.partyMap.get(context.deps.incumbent.partyId);
    const candidacy = incumbentCandidacy({
      incumbentId: context.deps.incumbent.id ?? null,
      candidateIds: context.candidates.map((c) => ({
        characterId: c.characterId?.toString() ?? null,
        nppId: c.nppId?.toString() ?? null,
      })),
      termLimited: context.deps.incumbent.termLimited === true,
      filingOpen: context.election.status === "active",
    });
    incumbentDisplay = {
      name: context.deps.incumbent.name,
      party:
        incumbentParty?.name ??
        (context.deps.incumbent.partyId === "independent"
          ? "Independent"
          : context.deps.incumbent.partyId),
      partyColor: incumbentParty?.color ?? null,
      ...(context.deps.incumbent.id
        ? { running: candidacy.running, notRunningReason: candidacy.reason }
        : {}),
    };
  }

  // Phase B follow-up — driver inputs for the PersuasionDrivers card.
  // Computed only in full-view, general phase (the card only renders for
  // active general elections). The card consumer (`computePersuasionDriverDisplay`)
  // treats missing maps as "neutral / no data" so primaries / summary views
  // omit cleanly.
  let fundsByPartyMap: Record<string, number> | undefined;
  let incumbentSeatShareByPartyMap: Record<string, number> | undefined;
  let persuasionRegByPartyMap: Record<string, number> | undefined;
  let medianVoter: { ep: number; sp: number } | undefined;
  let presidentialCoattailPctByParty: Record<string, number> | undefined;
  let gubernatorialCoattailPctByParty: Record<string, number> | undefined;
  let midtermOppositionBoostPctByParty: Record<string, number> | undefined;
  let incumbentApprovalForDisplay: number | undefined;
  let incumbentPartyIdForDisplay: string | undefined;
  let legislativeIncumbentPartyIdForDisplay: string | undefined;
  let legislativeIncumbentTenureTermsForDisplay: number | undefined;
  if (context.isFull && context.inGeneral) {
    // M5 — feed the policy-distance driver with a real reference point
    // instead of the engine's `(0, 0)` fallback. State-scoped races use
    // the seat's own state median; US presidential uses an EV-weighted
    // national aggregate so the card reflects what candidates actually
    // court on the EV map. See `medianVoter.ts` for the math.
    const useEvWeightedMedian = usesEvWeightedNationalMedian(
      context.election.electionType,
      context.countryId as CountryId
    );
    const demographicsQueryStateIds: string[] = useEvWeightedMedian
      ? Object.keys(context.evByState)
      : context.election.state
        ? [context.election.state]
        : [];

    const [fundsMap, seatShareMap, allDemographics, allDefaults] = await Promise.all([
      getFundsByPartyForElection(context.electionOid, context.db),
      getIncumbentSeatShareByParty(context.election, context.db),
      demographicsQueryStateIds.length > 0
        ? stateDemographicsCollection(context.db)
            .find({
              _id: { $in: demographicsQueryStateIds },
              countryId: context.countryId as CountryId,
            })
            .toArray()
        : Promise.resolve([] as StateDemographics[]),
      demographicsQueryStateIds.length > 0
        ? demographicDefaultsCollection(context.db)
            .find({
              _id: { $in: demographicsQueryStateIds },
              countryId: context.countryId as CountryId,
            })
            .toArray()
        : Promise.resolve([] as StateDemographics[]),
    ]);
    if (fundsMap.size > 0) {
      fundsByPartyMap = Object.fromEntries(fundsMap);
    }
    // `getIncumbentSeatShareByParty` already returns an empty map for every
    // single-winner race (US Senate + executives), so the card can never show
    // a prior vote split as an "Incumbency" row on a vacant seat.
    if (seatShareMap.size > 0) {
      // Same ratchet cap the vote engine applies under party renewal.
      incumbentSeatShareByPartyMap = Object.fromEntries(
        context.gameState?.nppPartyRenewalEnabled === true
          ? capIncumbentSeatShares(seatShareMap)
          : seatShareMap
      );
    }

    // Per-party registration for the race's state so the driver card can
    // scale its rows by the engine's effective peelable fraction (mirrors
    // the `regByParty` map the swing-flow engine consumes). State-scoped
    // races only; rows without seeded `registration` are omitted so the
    // display falls back to the engine's no-Reg baseline.
    if (context.election.state) {
      const regEntries: Record<string, number> = {};
      for (const po of context.statePartyOrgs) {
        if (
          po.stateId === context.election.state &&
          (po.countryId ?? "US") === context.countryId &&
          typeof po.registration === "number"
        ) {
          regEntries[po.partyId] = po.registration;
        }
      }
      if (Object.keys(regEntries).length > 0) {
        persuasionRegByPartyMap = regEntries;
      }
    }

    medianVoter = censusMedianVoter({
      countryId: context.countryId,
      preset: context.gameState?.preset,
      eraYear: eraYearContextFromGameState(context.gameState),
      demographics: allDemographics,
      defaults: allDefaults,
      evByState: useEvWeightedMedian ? context.evByState : null,
      stateId: context.election.state ?? undefined,
    });

    // Coattails inputs for the persuasion-drivers card (mirrors the turn
    // engine; display values here). Both are nominal-share multipliers
    // converted to a percentage tilt: presidential is the sitting President's
    // party nationwide; gubernatorial is the sitting governor's party in-state.
    const cid = context.countryId as CountryId;
    const partyIdsInRace = new Set(context.enrichedWithYou.map((c) => c.party));
    const isPresidentialRace = isHeadOfGovernmentRace(context.election.electionType, cid);
    if (!isPresidentialRace) {
      const president = await resolvePresidentApproval(context.db, cid);
      const presMod = buildPresidentialModifierByParty(president, partyIdsInRace);
      if (presMod.size > 0) presidentialCoattailPctByParty = presidentialModifierToPct(presMod);
    }
    if (isMidtermOppositionBoostEligible(context.election)) {
      const governingPartyIds = await resolveGoverningPartyIds(context.db, cid);
      const midtermMod = buildMidtermOppositionModifierByParty(governingPartyIds, partyIdsInRace);
      if (midtermMod.size > 0) {
        midtermOppositionBoostPctByParty = midtermOppositionModifierToPct(midtermMod);
      }
    }
    if (
      context.election.state &&
      isCoattailEligibleRace({
        isGeneralElection: context.inGeneral,
        electionType: context.election.electionType,
        regionalExecOfficeType: getRegionalExecutiveOfficeKey(cid),
        isOwnHeadOfGovernmentRace: isPresidentialRace,
      })
    ) {
      const exec = await resolveGovExecutiveApproval(context.db, cid, context.election.state);
      const partyIdsInState = new Set(context.enrichedWithYou.map((c) => c.party));
      const govMod = buildGovModifierByParty(exec, partyIdsInState);
      if (govMod.size > 0) gubernatorialCoattailPctByParty = govModifierToPct(govMod);
    }

    // Approval-scaled incumbency for the governor's OWN race (the gov coattail
    // block above skips it). Mirrors the turn engine so the card matches.
    if (
      context.election.state &&
      isOwnRegionalExecutiveRace({
        isGeneralElection: context.inGeneral,
        electionType: context.election.electionType,
        regionalExecOfficeType: getRegionalExecutiveOfficeKey(cid),
        hasState: Boolean(context.election.state),
      })
    ) {
      const exec = await resolveGovExecutiveApproval(context.db, cid, context.election.state);
      if (exec) {
        incumbentPartyIdForDisplay = exec.partyId;
        incumbentApprovalForDisplay = exec.approval;
      }
    }

    // Approval-scaled incumbency for the President's own race, matching the
    // turn engine. Sourced from the sitting President, not the live tally, so
    // the card matches the engine's shield/drag (VP rides the same ticket).
    if (isPresidentialRace) {
      const president = await resolvePresidentApproval(context.db, cid);
      if (president) {
        incumbentPartyIdForDisplay = president.partyId;
        incumbentApprovalForDisplay = president.approval;
      }
    }

    // Single-seat legislative own-race (US Senate): flat incumbency shield for
    // the sitting senator, matching the turn engine. Open seats / non-senate
    // races leave these undefined (card falls back to neutral).
    if (isSingleSeatLegislativeRace(context.election)) {
      const runningIdentities = new Set(
        context.candidates
          .map((c) => (c.characterId ?? c.nppId)?.toString())
          .filter((id): id is string => Boolean(id))
      );
      const legInc = await resolveSingleSeatLegislativeIncumbent(
        context.election,
        runningIdentities,
        context.db
      );
      if (legInc) {
        legislativeIncumbentPartyIdForDisplay = legInc.incumbentPartyId;
        legislativeIncumbentTenureTermsForDisplay = legInc.tenureTerms;
      }
    }
  }

  // Registration Influence card — per-state party-lean breakdown for the US
  // presidential shell. `statePartyOrgs` already holds every state's rows for
  // the presidential full view (fetchDepsForElection); pair them with the
  // non-party pool buckets so the card can render real lean data instead of
  // the "no data tracked" placeholder. States without seeded registration are
  // omitted by the builder, preserving the honest placeholder per-state.
  // partyDisplayById is always attached for the presidential shell so the
  // battleground hover cards can resolve abbreviations (not raw sequentialIds).
  let regByState: ElectionResponse["regByState"];
  let partyDisplayById: ElectionResponse["partyDisplayById"];
  // Attached to every full view, not just the presidential shell. `parties` is
  // already loaded above for this country, so this costs nothing extra, and
  // without it a non-presidential detail page has no way to print a party
  // ABBREVIATION — it would have to fall back to the full registered name
  // ("Sozialdemokratische Partei Deutschlands takes 9 of 19").
  if (context.isFull) {
    partyDisplayById = buildPartyDisplayById(context.parties);
  }

  // The seat's own region electorate, for the detail page's turnout figure.
  // `statesForEnrichment` already holds this region's doc, so this costs no
  // extra query. Prefer the voting-eligible count; fall back to total
  // population and SAY so, because the two differ by roughly a quarter and a
  // population figure passed off as an electorate understates turnout.
  let regionElectorate: ElectionResponse["regionElectorate"];
  let regionName: string | undefined;
  if (context.isFull) {
    const seatRegion = context.election.seatId
      ? parseSeatId(context.election.seatId).localRegionId
      : null;
    const stateDoc = seatRegion ? context.statesForEnrichment.get(seatRegion) : undefined;
    if (stateDoc?.name) regionName = stateDoc.name;
    if (stateDoc?.votingEligiblePopulation) {
      regionElectorate = { count: stateDoc.votingEligiblePopulation, basis: "eligible" };
    } else if (stateDoc?.population) {
      regionElectorate = { count: stateDoc.population, basis: "residents" };
    }
  }
  // General OR ended — the presidential shell (and this card) renders for both
  // (`!inPrimary && !isUpcoming`), and registration is a phase-agnostic
  // baseline, so populate it wherever the card is shown rather than only mid-race.
  if (context.isFull && context.isPresident && (context.inGeneral || context.isEnded)) {
    const pools = await stateRegistrationPoolCollection(context.db)
      .find({ countryId: context.countryId })
      .toArray();
    // The presidential deps load every country's statePartyOrg rows
    // (`fetchDepsForElection` uses `find({})`); scope to this election's
    // country so foreign states never leak into the US breakdown. Legacy
    // rows without `countryId` are treated as US, matching the rest of the file.
    const countryStatePartyOrgs = context.statePartyOrgs.filter(
      (po) => (po.countryId ?? "US") === context.countryId
    );
    const built = buildPresidentialRegByStateInput(countryStatePartyOrgs, pools);
    if (Object.keys(built).length > 0) {
      regByState = built;
    }
  }

  return {
    // Identity
    id: context.election._id.toString(),
    seatId: context.election.seatId ?? null,
    electionType: context.election.electionType,
    allocationMethod: context.election.allocationMethod,
    state: context.election.state,
    countryId: context.countryId,
    ...(context.election.bulgarianFoundingRound
      ? {
          bulgarianFoundingRound: {
            ruleVersion: context.election.bulgarianFoundingRound.ruleVersion,
            round: context.election.bulgarianFoundingRound.round,
            newNominationDistrictIds:
              context.election.bulgarianFoundingRound.newNominationDistrictIds,
          },
        }
      : {}),
    ...(context.election.hungarianAssemblyRound
      ? {
          hungarianAssemblyRound: {
            ruleVersion: context.election.hungarianAssemblyRound.ruleVersion,
            round: context.election.hungarianAssemblyRound.round,
            ...(context.election.hungarianAssemblyRound.byElection
              ? {
                  vacancyDistrictIds:
                    context.election.hungarianAssemblyRound.byElection.districtIds,
                }
              : {}),
          },
        }
      : {}),
    ...(context.election.hungarianModernAssembly
      ? {
          hungarianModernAssembly: {
            ruleVersion: context.election.hungarianModernAssembly.ruleVersion,
          },
        }
      : {}),
    ...(context.election.japanShugiinRules
      ? {
          japanShugiinRules: {
            ruleVersion: context.election.japanShugiinRules.ruleVersion,
            districtSeats: context.election.japanShugiinRules.districtSeats,
            listSeats: context.election.japanShugiinRules.listSeats,
          },
        }
      : {}),
    ...(context.election.hungarianModernByElection
      ? {
          hungarianModernByElection: {
            districtId: context.election.hungarianModernByElection.districtId,
          },
        }
      : {}),
    ...(context.election.russianDumaRound
      ? {
          russianDumaRound: {
            cohortId: context.election.russianDumaRound.cohortId.toHexString(),
            mandateSinceTurn: context.election.russianDumaRound.mandateSinceTurn,
            tier: context.election.russianDumaRound.tier,
          },
        }
      : {}),
    senateClass: context.election.senateClass ?? null,
    chamberClass: context.election.chamberClass ?? null,
    cycle: context.election.cycle,
    electionYear: context.election.electionYear ?? null,
    resolvedYear: resolveElectionYear(
      context.election,
      cycleAnchorContextFromGameState(context.gameState)
    ),
    status: context.election.status,
    totalSeats: context.election.totalSeats ?? null,

    // Timing
    startTime: context.election.startTime ?? null,
    endTime: context.election.endTime ?? null,
    primaryEndTime: context.election.primaryEndTime ?? null,
    // Turn-based deadlines for drift-free countdowns (see ElectionResponse).
    startTurn: context.election.startTurn ?? null,
    endTurn: context.election.endTurn ?? null,
    primaryEndTurn: context.election.primaryEndTurn ?? null,
    durationHours: context.election.durationHours ?? null,
    primaryDurationHours: context.election.primaryDurationHours ?? null,

    // Phase
    inPrimary: context.inPrimary,
    isEnded: context.isEnded,
    isUpcoming: context.isUpcoming,
    inGeneral: context.inGeneral,
    primaryAdvanceCount: context.primaryAdvanceCount,
    ...(context.primaryCalendar ? { primaryCalendar: context.primaryCalendar } : {}),

    // Core data
    candidates: context.displayCandidates,
    byParty: context.byParty,
    polling: context.polling,
    seatsEstimate: context.seatsEstimate,
    seatsDecidedByDistrict: context.isFull ? context.seatsDecidedByDistrict : false,
    incumbent: incumbentDisplay,

    // Full-view fields
    prevElectionId: context.isFull ? context.prevElectionId : null,
    nextElectionId: context.isFull ? context.nextElectionId : null,
    allCandidates: context.isFull ? context.primaryCandidates : null,
    snapshotHistory: context.isFull ? context.snapshotHistory : null,
    generalVotes: context.isFull ? context.generalVotes : null,
    myCharId: context.isFull ? context.myCharId : null,
    myEndorsedCandidateId: context.isFull ? context.myEndorsedCandidateId : null,
    myPartyId: context.isFull ? context.myPartyId : null,
    myCampaignId: context.isFull ? context.myCampaignId : null,
    isAdmin: context.isFull ? context.isAdmin : false,
    gameState:
      context.isFull && context.gameState
        ? {
            isActive: context.gameState.isActive,
            pausedAt: context.gameState.pausedAt ?? null,
            lastTurnProcessed: context.gameState.lastTurnProcessed ?? null,
            currentTurn: context.gameState.currentTurn,
            effectiveNow: context.gameTime.effectiveNow.toISOString(),
          }
        : null,

    // Phase B follow-up — driver inputs (general phase only).
    ...(fundsByPartyMap ? { fundsByParty: fundsByPartyMap } : {}),
    ...(incumbentSeatShareByPartyMap
      ? { incumbentSeatShareByParty: incumbentSeatShareByPartyMap }
      : {}),
    ...(persuasionRegByPartyMap ? { persuasionRegByParty: persuasionRegByPartyMap } : {}),
    ...(medianVoter ? { medianVoter } : {}),
    ...(presidentialCoattailPctByParty ? { presidentialCoattailPctByParty } : {}),
    ...(gubernatorialCoattailPctByParty ? { gubernatorialCoattailPctByParty } : {}),
    ...(midtermOppositionBoostPctByParty ? { midtermOppositionBoostPctByParty } : {}),
    ...(incumbentApprovalForDisplay != null
      ? { incumbentApproval: incumbentApprovalForDisplay }
      : {}),
    ...(incumbentPartyIdForDisplay != null ? { incumbentPartyId: incumbentPartyIdForDisplay } : {}),
    ...(legislativeIncumbentPartyIdForDisplay != null
      ? {
          legislativeIncumbentPartyId: legislativeIncumbentPartyIdForDisplay,
          legislativeIncumbentTenureTerms: legislativeIncumbentTenureTermsForDisplay,
        }
      : {}),

    // National Mood gauge input (president only, when the engine recorded one).
    ...(context.economicReferendum ? { economicReferendum: context.economicReferendum } : {}),
    ...(context.democraticHealth ? { democraticHealth: context.democraticHealth } : {}),
    ...(context.factorLedger ? { factorLedger: context.factorLedger } : {}),

    // Registration Influence card inputs (US presidential general only).
    ...(regByState ? { regByState } : {}),
    ...(partyDisplayById ? { partyDisplayById } : {}),
    ...(regionElectorate ? { regionElectorate } : {}),
    ...(regionName ? { regionName } : {}),
    ...(context.tally?.primaryVotes ? { primaryVotes: context.tally.primaryVotes } : {}),
    // Finished primaries: once a race is past its primary (general running,
    // or the whole race over), the stored primary result is history.
    ...((context.isEnded || context.inGeneral) && context.tally?.primaryResults
      ? { primaryResults: finishedPrimaryResults(context.tally.primaryResults) }
      : {}),
  };
}
