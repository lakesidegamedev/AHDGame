import { cumulativeVoteShares } from "@/lib/elections/rules/cumulativeVoteShares";
import { tallyPublicationFilter } from "@/lib/elections/tallyPublication";
import { russianDumaVoteTotals } from "@/lib/countries/ru/rules/assemblyVoteIncrement";
import { russianCouncilVoteTotals } from "@/lib/countries/ru/rules/councilVoteTotals";
import { resolveRussianCouncilBallot } from "@/lib/countries/ru/rules/councilResult";
import { russianPresidentialVoteIncrement } from "@/lib/countries/ru/rules/presidentialVoteIncrement";
import { campaignStrengthLookupKey } from "@/lib/campaigns/suspendEndorseLifecycle";
import { loadRaceCampaignMultiplier } from "@/lib/campaigns/raceCampaignEffects";
import { getStateLean } from "@/lib/utils/demographics";

import type { VoteTurnSnapshot } from "@/lib/db/types";
import { ObjectId } from "mongodb";

import { buildGovModifierByParty } from "@/lib/elections/engine/govCoattail";

import { allocateSeats, isMultiSeatElection } from "@/lib/elections/resolution/seatAllocation";

import { resolveHouseIncumbentTenures } from "@/lib/elections/engine/singleSeatIncumbency";

import { accumulateHuBallots } from "@/lib/countries/hu/rules/accumulateBallots2014";
import { allocateHuListTurnVotes } from "@/lib/countries/hu/rules/listBallots2014";
import {
  accumulateJapanBallots,
  allocateJapanListTurnVotes,
} from "@/lib/countries/jp/rules/shugiinBallotMath";
import { buildPresidentialModifierByParty } from "@/lib/elections/engine/presidentialCoattail";
import { computeMedianVoter } from "@/lib/elections/engine/medianVoter";

import { getCountryState } from "@/lib/countryState";

import { buildMidtermOppositionModifierByParty } from "@/lib/elections/engine/midtermOppositionBoost";

import {
  resolveElectionManifestoMultipliers,
  deriveGroupLeans,
} from "@/lib/countries/uk/manifesto/electionManifestoResolver";

import { buildCrisisBlameModifierByParty } from "@/lib/elections/engine/crisisBlame";

import { capIncumbentSeatShares } from "@/lib/parties/rules/partyRenewal";
import {
  castRankedBallots,
  mergeRankedBallots,
  countPrStv,
  validateRankedBallots,
} from "@/lib/elections/rules/prStv";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";

import { electionVoteTalliesCollection } from "@/lib/db/repositories/electionVoteTallies";
import { campaignsCollection } from "@/lib/db/repositories/campaigns";

import { executiveEndorsementsCollection } from "@/lib/db/repositories/executiveEndorsements";

import type { AccumulateVoteTurnStageContext } from "@/lib/elections/engine/tallyManagement";

export async function settleVoteTurn(context: AccumulateVoteTurnStageContext): Promise<void> {
  // Party renewal bounds the ratchet: past half the seats, no further shield.
  const incumbentSeatShareByParty =
    context.priorSeatShareByParty && context.partyRenewalEnabled
      ? capIncumbentSeatShares(context.priorSeatShareByParty)
      : context.priorSeatShareByParty;

  const presidentialModifierByParty =
    context.isGeneralElection && !context.isOwnHeadOfGovernmentRace
      ? buildPresidentialModifierByParty(context.president ?? null, context.partyIdsInRace)
      : undefined;

  // A stale `electedOfficials.party` value that doesn't match a party actually
  // in the race silently no-ops (empty map → neutral 1.0×).
  const govModifierByParty = context.wantsGovCoattail
    ? buildGovModifierByParty(context.govExecutive ?? null, context.partyIdsInRace)
    : undefined;

  const crisisBlameModifierByParty = context.crisisBlameShifts
    ? buildCrisisBlameModifierByParty(
        context.crisisBlameShifts,
        context.stateId,
        context.partyIdsInRace,
        context.turnNumber
      )
    : undefined;

  const midtermOppositionModifierByParty = context.wantsMidtermOppositionBoost
    ? buildMidtermOppositionModifierByParty(
        context.governingPartyIds ?? new Set(),
        context.partyIdsInRace
      )
    : undefined;

  // Approval-modulated incumbency (own regional-executive race only). The
  // governor coattail deliberately skips the executive's own seat; this fills
  // that gap by feeding the sitting governor's approval into the incumbency
  // driver — a shield when popular, a drag when unpopular. The presidential
  // race is excluded: that engine already folds approval into a dedicated
  // `strengthMultiplier`, so routing it here would double-count.
  const incumbentPartyId =
    context.wantsOwnExecIncumbency && context.govExecutive
      ? context.govExecutive.partyId
      : undefined;
  const incumbentApproval =
    context.wantsOwnExecIncumbency && context.govExecutive
      ? context.govExecutive.approval
      : undefined;

  const legislativeIncumbentPartyId = context.legInc ? context.legInc.incumbentPartyId : undefined;
  const legislativeIncumbentTenureTerms = context.legInc ? context.legInc.tenureTerms : undefined;

  // M3 — per-state median voter for the policy-distance driver.
  // Computed from the already-built electorate units so no extra
  // DB hit. GOTV / suppression effects shift the median via liveTurnouts.
  const medianVoter = context.isGeneralElection
    ? computeMedianVoter(context.effElectorate, context.effLiveTurnouts)
    : undefined;

  // Multi-seat legislative own-race (US House): per-candidate consecutive-term
  // fatigue — a state's House delegation can have several simultaneous
  // incumbents at once (one per party's returning nominee), so this is a map
  // rather than the Senate's single flat-shield party+terms pair. See
  // `resolveHouseIncumbentTenures`'s doc comment in singleSeatIncumbency.ts
  // for why the House needs this different shape.
  let houseIncumbentTenureTermsByCandidateId: Map<string, number> | undefined;
  if (context.isGeneralElection && context.election.electionType === "house") {
    if (context.options?.preload?.houseIncumbentTenuresByElection) {
      houseIncumbentTenureTermsByCandidateId =
        context.options.preload.houseIncumbentTenuresByElection.get(
          context.electionId.toString()
        ) ?? new Map();
    } else {
      const runningIdentityToCandidateId = new Map<string, string>();
      for (const c of context.candidates) {
        const identity = (c.characterId ?? c.nppId)?.toString();
        if (identity) runningIdentityToCandidateId.set(identity, c._id.toString());
      }
      houseIncumbentTenureTermsByCandidateId = await resolveHouseIncumbentTenures(
        context.election,
        runningIdentityToCandidateId,
        context.db
      );
    }
  }

  // UK manifesto policy-popularity map. Off by default: the
  // resolver short-circuits to undefined unless UK_MANIFESTO_VOTE_EFFECT=1 and
  // this is a UK general election with locked manifestos — so no DB read and no
  // behaviour change in prod until the coefficient is worldsim-calibrated.
  const manifestoMultipliers = await resolveElectionManifestoMultipliers(context.db, {
    countryId: context.electionCountryId,
    electionId: context.electionId,
    isGeneralElection: context.isGeneralElection,
    groups: deriveGroupLeans(context.effElectorate),
  });

  // Runtime one-party flag for the FPTP spoiler gate, so a mid-game conversion
  // takes effect at once (the compile-time config is wrong for converted worlds).
  // The batched path preloads it; the standalone path reads cached countryState.
  const isOnePartyState =
    context.isGeneralElection &&
    (
      context.options?.preload?.enrichmentCountryConfigByElection?.get(
        context.electionId.toString()
      ) ?? (await getCountryState(context.db, context.electionCountryId))
    ).governmentType === "onePartyState";

  const { votesPerCandidate } = (0, context.distributeFn)(
    context.effEnriched,
    context.effEffectiveTurnPool,
    context.effTotalPool,
    context.electorate,
    context.effElectorate,
    context.partyOrgByParty,
    {
      includeInfluenceInAppeal: false,
      useNationalInfluenceForReach: false,
      votingSystem: context.state.votingSystem ?? "fptp",
      isGeneralElection: context.isGeneralElection,
      isOnePartyState,
      countryId: context.electionCountryId,
      currentStateId: context.stateId,
      parentRegionId: context.state.parentRegionId,
      manifestoMultipliers,
      liveTurnouts: context.effLiveTurnouts, // Pass resolved turnout to vote distribution
      hasPlayerInRace: context.hasPlayerInRace,
      partyGroupFavorabilityByKey: context.effPartyGroupFavorabilityByKey,
      // Phase 5a — entrenched-Reg multiplier; consumed only in general
      // elections. Empty / partial maps fall through to the neutral 1.0×
      // per `regResistanceMultiplier`'s undefined branch.
      regByParty: context.regByParty,
      // Current-registration baseline. Undefined disables the lane.
      regBaselineByParty: context.regBaselineByParty,
      // Governor coattail (§7.3.2 govModifier) — in-state down-ballot only.
      govModifierByParty,
      // A1 — per-party prior seat-share for the incumbency driver.
      incumbentSeatShareByParty,
      // Approval-scaled directional incumbency for the executive's own race.
      incumbentPartyId,
      incumbentApproval,
      // Flat single-seat legislative (US Senate) incumbency shield.
      legislativeIncumbentPartyId,
      legislativeIncumbentTenureTerms,
      // Per-candidate multi-seat legislative (US House) tenure fatigue.
      houseIncumbentTenureTermsByCandidateId,
      // A2 — per-party spend-this-turn for the money driver.
      fundsByParty: context.fundsByParty,
      // Presidential coattail — sitting President's nominal-share multiplier.
      presidentialModifierByParty,
      midtermOppositionModifierByParty,
      crisisBlameModifierByParty,
      // M3 — per-state median voter for the policy-distance driver.
      medianVoter,
    }
  );

  // Executive-leader endorsements: when the sitting head of government has
  // endorsed a candidate in this race, apply a +1.5% multiplier to that
  // candidate's per-turn vote increment. Mirrors the governor→presidential
  // bonus in presidentialElectionEngine. Cross-race bleed isn't a concern
  // because each `Election` is state-scoped (one race per AZ House district,
  // one race for AZ Senate Class 1, etc.) so the multiplier only touches
  // votes in this specific race's tally.
  const executiveEndorsedCandidateIds =
    context.memo?.executiveEndorsedCandidateIdsByElection?.get(context.electionId.toString()) ??
    new Set(
      (
        await executiveEndorsementsCollection(context.db)
          .find({ electionId: context.electionId, isActive: true })
          .project<{ candidateId: ObjectId }>({ candidateId: 1 })
          .toArray()
      ).map((e) => e.candidateId.toString())
    );
  const EXECUTIVE_ENDORSEMENT_VOTE_BONUS = 1.015;

  // Campaign Ground Game and field offices in this race's region. Keyed by
  // the campaign's candidate (character or NPP id), not the filing row.
  const campaignKeyByCandidateId = new Map(
    context.candidates.map((c) => [c._id.toString(), campaignStrengthLookupKey(c)])
  );
  const campaignMultiplier = await loadRaceCampaignMultiplier(context.db, {
    electionId: context.electionId,
    countryId: context.electionCountryId,
    regionId: context.stateId,
    currentTurn: context.turnNumber,
    isSwingRegion: Math.abs(getStateLean(context.state, context.stateId)) < 0.5,
    memo: context.memo,
  });

  // Start with active increments. Bound Duma ballots then restore counted
  // withdrawals, which remain part of participation and certification.
  const activeCandidateIds = new Set(context.enriched.map((ec) => ec.candidateId));
  let newTotals: Record<string, number> = context.isPrStv ? { ...context.tally.totalVotes } : {};
  const increments: Record<string, number> = {};
  for (const ec of context.enriched) {
    const raw = votesPerCandidate[ec.candidateId] ?? 0;
    const campaignKey = campaignKeyByCandidateId.get(ec.candidateId);
    const multiplier =
      (executiveEndorsedCandidateIds.has(ec.candidateId) ? EXECUTIVE_ENDORSEMENT_VOTE_BONUS : 1.0) *
      (campaignMultiplier && campaignKey ? campaignMultiplier(campaignKey) : 1.0);
    increments[ec.candidateId] = Math.round(raw * multiplier);
    newTotals[ec.candidateId] =
      (context.tally.totalVotes[ec.candidateId] ?? 0) + increments[ec.candidateId];
  }

  const rankedBallots = context.isPrStv
    ? mergeRankedBallots(
        context.tally.rankedBallots!,
        castRankedBallots(context.enriched, increments)
      )
    : undefined;
  if (context.isPrStv) validateRankedBallots(rankedBallots, newTotals);

  if (
    countryHasFeature("ruElections", context.election.countryId) &&
    context.election.russianPresidentialRound
  ) {
    const campaigns = await campaignsCollection(context.db)
      .find(
        { electionId: context.electionId },
        { projection: { candidateId: 1, campaignStrength: 1 } }
      )
      .toArray();
    const strengths = new Map(
      campaigns.map((campaign) => [campaign.candidateId.toString(), campaign.campaignStrength ?? 0])
    );
    const rawVotes = Object.fromEntries(
      context.enriched.map((candidate) => [
        candidate.candidateId,
        newTotals[candidate.candidateId] - (context.tally.totalVotes[candidate.candidateId] ?? 0),
      ])
    );
    const campaignStrength = Object.fromEntries(
      context.candidates.map((candidate) => [
        candidate._id.toString(),
        strengths.get(campaignStrengthLookupKey(candidate)) ?? 0,
      ])
    );
    const increments = russianPresidentialVoteIncrement({
      registeredVoters: context.election.russianPresidentialRound.registeredVoters,
      priorVotes: context.tally.totalVotes,
      rawVotes,
      campaignStrength,
    });
    for (const candidate of context.enriched)
      newTotals[candidate.candidateId] =
        (context.tally.totalVotes[candidate.candidateId] ?? 0) +
        (increments[candidate.candidateId] ?? 0);
  }

  if (context.isBgOrdinary || context.isHuBound || context.isBgFounding || context.isJapanMixed)
    for (const [id, votes] of Object.entries(context.tally.totalVotes)) {
      if (!activeCandidateIds.has(id)) newTotals[id] = votes;
    }
  if (context.isBoundDuma) {
    newTotals = russianDumaVoteTotals({
      registeredVoters: context.election.russianDumaRound!.registeredVoters,
      againstAllVotes: context.tally.russianDumaBallot?.againstAllVotes,
      priorVotes: context.tally.totalVotes,
      rawVotes: Object.fromEntries(
        context.enriched.map((candidate) => [
          candidate.candidateId,
          newTotals[candidate.candidateId] - (context.tally.totalVotes[candidate.candidateId] ?? 0),
        ])
      ),
    });
  }

  if (context.isHuBound || context.isBgFounding) {
    // The shared vote-ledger arithmetic preserves historical cast marks and
    // clamps only the new slice to the frozen registered electorate.
    newTotals = russianDumaVoteTotals({
      registeredVoters: context.huRegisteredVoters!,
      priorVotes: context.tally.totalVotes,
      rawVotes: Object.fromEntries(
        context.enriched.map((candidate) => [
          candidate.candidateId,
          newTotals[candidate.candidateId] - (context.tally.totalVotes[candidate.candidateId] ?? 0),
        ])
      ),
    });
  }
  const filingByCandidateId = new Map(
    context.candidates.map((candidate) => [candidate._id.toString(), candidate])
  );
  const statePartyOrgByParty = new Map(context.statePartyOrgs.map((row) => [row.partyId, row]));
  const huBallots =
    countryHasFeature("huElections", context.electionCountryId) &&
    context.election.electionType === "nationalAssembly" &&
    context.election.hungarianModernAssembly?.ruleVersion === "mixed-2011-v1" &&
    context.preset === "1991-default"
      ? accumulateHuBallots(
          context.stateId,
          context.enriched.map((ec) => {
            const filing = filingByCandidateId.get(ec.candidateId);
            return {
              candidateId: ec.candidateId,
              partyId: ec.party,
              constituencyId: filing?.constituencyId,
              isNPP: filing?.isNPP,
              votes: Math.max(
                0,
                newTotals[ec.candidateId] - (context.tally.totalVotes[ec.candidateId] ?? 0)
              ),
            };
          }),
          allocateHuListTurnVotes(
            Math.round(context.effEffectiveTurnPool),
            [...new Set(context.enriched.map((ec) => ec.party))]
              .filter((partyId) => partyId !== "independent")
              .map((partyId) => {
                const org = statePartyOrgByParty.get(partyId);
                return {
                  partyId,
                  registration: org?.registration,
                  organization: org?.organization,
                };
              })
          ),
          context.tally.huConstituencyVotes,
          context.tally.huListVotes
        )
      : null;
  const japanMixedBallots =
    countryHasFeature("jpElections", context.electionCountryId) &&
    (context.election.electionType === "shugiin" ||
      context.election.electionType === "snap_shugiin") &&
    context.election.japanShugiinRules?.ruleVersion === "mixed-1994-v1" &&
    context.preset === "1991-default"
      ? accumulateJapanBallots({
          regionId: context.stateId,
          candidates: context.enriched.map((candidate) => {
            const filing = filingByCandidateId.get(candidate.candidateId);
            return {
              candidateId: candidate.candidateId,
              partyId: candidate.party,
              constituencyId: filing?.constituencyId,
              isNPP: filing?.isNPP,
              votes: Math.max(
                0,
                newTotals[candidate.candidateId] -
                  (context.tally.totalVotes[candidate.candidateId] ?? 0)
              ),
            };
          }),
          listVoteIncrements: allocateJapanListTurnVotes(
            Math.round(context.effEffectiveTurnPool),
            [...new Set(context.enriched.map((candidate) => candidate.party))]
              .filter((partyId) => partyId !== "independent")
              .map((partyId) => {
                const org = statePartyOrgByParty.get(partyId);
                return {
                  partyId,
                  registration: org?.registration,
                  organization: org?.organization,
                };
              })
          ),
          previousDistricts: context.tally.japanShugiinConstituencyVotes,
          previousLists: context.tally.japanShugiinListVotes,
        })
      : null;
  let councilTotals: ReturnType<typeof russianCouncilVoteTotals> | null = null;
  if (context.isBoundCouncil) {
    const rawVotes = Object.fromEntries(
      context.enriched.map((candidate) => [
        candidate.candidateId,
        newTotals[candidate.candidateId] - (context.tally.totalVotes[candidate.candidateId] ?? 0),
      ])
    );
    const nominationById = new Map(
      context.candidates.map((candidate) => [
        candidate._id.toHexString(),
        candidate.russianCouncilNomination,
      ])
    );
    councilTotals = russianCouncilVoteTotals({
      registeredVoters: context.election.russianCouncilRound!.registeredVoters,
      priorVotes: context.tally.totalVotes,
      ledger: context.tally.russianCouncilBallot,
      rawVotes,
      rawAgainstAllVotes: Object.values(rawVotes).every((count) => count === 0)
        ? Math.max(0, Math.floor(context.effEffectiveTurnPool))
        : 0,
      nominees: context.enriched.map((candidate) => {
        const nomination = nominationById.get(candidate.candidateId);
        if (!nomination) throw new Error("Council voting needs each nominee's frozen registration");
        return {
          id: candidate.candidateId,
          registrationOrder: nomination.registrationOrder,
          economicLean: candidate.charEP,
          socialLean: candidate.charSP,
          favorability: candidate.favorability,
        };
      }),
    });
    newTotals = councilTotals.votes;
  }

  // Project seats with the same allocator used by final resolution.
  const seatsEstimate: Record<string, number> | undefined = (() => {
    if (context.isBgOrdinary || context.isHuBound || context.isBgFounding || context.isJapanMixed)
      return undefined;
    if (councilTotals) {
      const result = resolveRussianCouncilBallot({
        ...councilTotals.ballot,
        invalidated: context.tally.russianCouncilBallot?.invalidated,
      });
      const winners =
        result.outcome === "elected" && result.winnerIds.every((id) => activeCandidateIds.has(id))
          ? new Set(result.winnerIds)
          : new Set<string>();
      return Object.fromEntries(
        context.enriched.map((row) => [row.candidateId, winners.has(row.candidateId) ? 1 : 0])
      );
    }
    const electionType = context.election.electionType as string;
    const totalSeats = context.election.totalSeats as number | undefined;
    if (!totalSeats || !isMultiSeatElection(electionType, totalSeats)) return undefined;
    if (context.isPrStv) {
      if (rankedBallots!.length === 0) return undefined;
      return countPrStv(
        context.enriched.map((c) => c.candidateId),
        totalSeats,
        rankedBallots!
      ).seats;
    }
    const totalVotesCast = context.enriched.reduce(
      (s, ec) => s + (newTotals[ec.candidateId] ?? 0),
      0
    );
    if (totalVotesCast === 0) return undefined;
    const ranked = context.enriched
      .map((candidate) => ({
        id: candidate.candidateId,
        votes: newTotals[candidate.candidateId] ?? 0,
        party: candidate.party,
        isNPP: candidate.isNPP,
      }))
      .sort((a, b) => b.votes - a.votes || a.id.localeCompare(b.id));
    const stateId = context.election.state;
    return allocateSeats(
      electionType,
      stateId,
      totalSeats,
      ranked,
      totalVotesCast,
      stateId ? { [stateId]: totalSeats } : {},
      undefined,
      stateId ? { [stateId]: totalSeats } : {},
      context.election.countryId ?? "US",
      context.election.allocationMethod
    ).seatsEstimate;
  })();

  const nativeRussianTotal = councilTotals
    ? councilTotals.ledger.validBallots
    : (countryHasFeature("ruElections", context.election.countryId) &&
          context.election.russianPresidentialRound) ||
        context.isBoundDuma
      ? Object.values(newTotals).reduce((sum, count) => sum + count, 0) +
        (context.isBoundDuma ? (context.tally.russianDumaBallot?.againstAllVotes ?? 0) : 0)
      : null;
  const snapshot: VoteTurnSnapshot = {
    turn: context.turnNumber,
    ...(context.slicePart ? { slicePart: context.slicePart } : {}),
    recordedAt: context.now,
    cumulativeVotes: { ...newTotals },
    sharesPct: cumulativeVoteShares(newTotals, nativeRussianTotal ?? undefined),
    ...(seatsEstimate ? { seatsEstimate } : {}),
    ...(context.participationSummary ? { participation: context.participationSummary } : {}),
    ...(councilTotals
      ? {
          russianCouncilBallot: {
            registeredVoters: councilTotals.ledger.registeredVoters,
            validBallots: councilTotals.ledger.validBallots,
            againstAllVotes: councilTotals.ledger.againstAllVotes,
          },
        }
      : {}),
  };

  // Sync nominee labels, retaining counted Duma withdrawals for certification.
  const cleanedNames = { ...context.tally.candidateNames };
  const cleanedParties = { ...context.tally.candidateParties };
  for (const key of Object.keys(context.tally.totalVotes)) {
    if (
      !activeCandidateIds.has(key) &&
      !context.isBoundDuma &&
      !context.isBoundCouncil &&
      !context.isBgOrdinary &&
      !context.isHuBound &&
      !context.isJapanMixed &&
      !context.isBgFounding
    ) {
      delete cleanedNames[key];
      delete cleanedParties[key];
    }
  }
  for (const ec of context.enriched) {
    if (!cleanedNames[ec.candidateId]) {
      cleanedNames[ec.candidateId] = ec.characterName;
      cleanedParties[ec.candidateId] = ec.party;
    }
  }

  const tallyUpdate = {
    ...(context.isBgOrdinary || context.isHuBound || context.isBgFounding || context.isJapanMixed
      ? { $unset: { seatsEstimate: "" as const } }
      : {}),
    $set: {
      ...(context.isBgOrdinary ? { bgOrdinaryBallot: true as const } : {}),
      ...(context.isHuBound ? { hungarianAssemblyBallot: true as const } : {}),
      ...(context.isBgFounding ? { bulgarianFoundingBallot: true as const } : {}),
      totalVotes: newTotals,
      ...(huBallots
        ? {
            huConstituencyVotes: huBallots.constituencyVotes,
            huListVotes: huBallots.listVotes,
            huDistrictSlate: huBallots.districtSlate,
          }
        : {}),
      ...(japanMixedBallots
        ? {
            japanShugiinConstituencyVotes: japanMixedBallots.constituencyVotes,
            japanShugiinListVotes: japanMixedBallots.listVotes,
          }
        : {}),
      candidateNames: cleanedNames,
      candidateParties: cleanedParties,
      ...(context.election.allocationMethod === "sntv"
        ? {
            candidateIsNPP: Object.fromEntries(
              context.enriched.map((ec) => [ec.candidateId, Boolean(ec.isNPP)])
            ),
          }
        : {}),
      ...(councilTotals
        ? {
            russianCouncilBallot: {
              ...context.tally.russianCouncilBallot,
              ...councilTotals.ledger,
            },
          }
        : {}),
      ...(context.isBoundDuma
        ? {
            russianDumaBallot: {
              ...context.tally.russianDumaBallot,
              againstAllVotes: context.tally.russianDumaBallot?.againstAllVotes ?? 0,
            },
          }
        : {}),
      ...(seatsEstimate ? { seatsEstimate } : {}),
      ...(context.isPrStv
        ? { rankedBallots, rankedPreferenceModel: "same_party_then_policy_distance_v1" as const }
        : {}),
      updatedAt: context.now,
    },
    $push: { turnSnapshots: snapshot } as never,
  };
  // STV totals and original ballots must commit together, and a concurrent
  // replay must not overwrite another turn's ballot receipt. The rest of a
  // split turn lands only beside that turn's early half.
  const tallyFilter = tallyPublicationFilter({
    electionId: context.electionId,
    totalVotes: context.tally.totalVotes,
    snapshots: context.tally.turnSnapshots,
    turn: context.turnNumber,
    slicePart: context.slicePart,
  });
  if (context.options?.tallyWrites) {
    context.options.tallyWrites.push({ updateOne: { filter: tallyFilter, update: tallyUpdate } });
    return;
  }
  const write = await electionVoteTalliesCollection(context.db).updateOne(tallyFilter, tallyUpdate);
  if (context.isPrStv && write.matchedCount !== 1)
    throw new Error("PR-STV accumulation lost its tally revision; retry from persisted ballots");
}
