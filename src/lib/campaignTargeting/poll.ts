/**
 * Campaign polls read the same turnout inputs and targeted ad responses as
 * election counting. projectCampaignPoll estimates the next slice of voters;
 * it does not rewrite ballots already counted or reveal rivals' ad purchases.
 */

import { COUNTRIES_WITH_BESPOKE_PRESIDENTIAL_ELECTIONS } from "@/lib/constants/countries";
import {
  calcPrimaryScore,
  primarySharePctSoftmax,
  PRIMARY_SHARE_SOFTMAX_TEMPERATURE,
} from "@/lib/primaryScore";
import { NPP_PRIMARY_SCORE_MULTIPLIER } from "@/lib/elections/engine/constants";
import {
  shiftElectorateForPrimary,
  applyPrimaryTurnoutRetention,
} from "@/lib/campaigns/shiftPrimaryElectorate";
import { ObjectId, type Db } from "mongodb";
import type {
  Character,
  Election,
  ElectionCandidate,
  StateDemographicTurnout,
  StatePartyOrg,
} from "@/lib/db/types";
import { fetchEnrichedCandidates } from "@/lib/elections/engine/candidateEnrichment";
import { distributeVotesByGroupLevelAllocation } from "@/lib/elections/engine/voteDistribution";
import { distributeVotesBySwingFlow } from "@/lib/elections/engine/voteDistributionSwingFlow";
import { buildGranularElectorateSubstrate } from "@/lib/demographics/granularElectorate";
import { loadCampaignAudience } from "./audience";
import {
  targetedAdBonuses,
  turnoutForElection,
  usesCampaignAds,
  campaignPrimaryScore,
  meanAdBonus,
  organizationAdWeight,
  NG_CAMPAIGN_TURNOUT_RATE,
} from "./rules";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";

export async function projectCampaignPoll(
  db: Db,
  electionId: string,
  character: Character,
  turnoutDoc: StateDemographicTurnout | null,
  partyOrgs: StatePartyOrg[],
  inPrimary: boolean
) {
  const election = await electionsCollection(db).findOne({
    _id: new ObjectId(electionId),
    countryId: character.countryId,
  });
  if (!election) return null;
  const candidates = await electionCandidatesCollection(db)
    .find({
      electionId: election._id,
      status: "active",
      ...(inPrimary ? { party: character.party } : {}),
    })
    .toArray();
  const myCandidate = candidates.find((candidate) => candidate.characterId.equals(character._id));
  if (!myCandidate) return null;
  const [audience, enriched] = await Promise.all([
    loadCampaignAudience(db, character.countryId, character.homeState, turnoutDoc),
    fetchEnrichedCandidates(candidates, {
      includePartyPositions: true,
      countryId: character.countryId,
    }),
  ]);
  if (!audience || !usesCampaignAds(election, enriched)) return null;
  const substrate = buildGranularElectorateSubstrate({
    ...audience.context,
    campaignRulesVersion: election.campaignRulesVersion ?? 0,
    turnoutDoc: turnoutForElection(turnoutDoc, election),
    enriched,
  });
  if (!substrate?.campaignCells) return null;
  const presidential = election.electionType === "president";
  const cells = substrate.campaignCells;
  const bonusesByCandidate = Object.fromEntries(
    enriched.map((candidate) => [
      candidate.candidateId,
      targetedAdBonuses(
        cells,
        { economicLean: candidate.charEP, socialLean: candidate.charSP },
        candidate.targetedAds ?? [],
        character.homeState,
        audience.context.currentTurn
      ),
    ])
  );
  const base = {
    myCandidateId: myCandidate._id.toString(),
    totalPool: substrate.totalPool,
    cells,
    bonusesByCandidate,
  };
  if (presidential && COUNTRIES_WITH_BESPOKE_PRESIDENTIAL_ELECTIONS.has(election.countryId)) {
    if (!countryHasFeature("ngLib", election.countryId) || inPrimary) return null;
    const weights = enriched.map((candidate) => {
      const org =
        partyOrgs.find(
          (row) => row.stateId === character.homeState && row.partyId === candidate.party
        )?.organization ?? 0;
      return organizationAdWeight(
        org,
        meanAdBonus(cells, bonusesByCandidate[candidate.candidateId])
      );
    });
    const sum = weights.reduce((total, weight) => total + weight, 0);
    const pool = audience.context.statePopulation * NG_CAMPAIGN_TURNOUT_RATE;
    return {
      ...base,
      totalPool: pool,
      votes: Object.fromEntries(
        enriched.map((candidate, index) => [
          candidate.candidateId,
          sum > 0 ? (pool * weights[index]) / sum : 0,
        ])
      ),
    };
  }
  if (inPrimary && !presidential) {
    const scores = enriched.map(
      (candidate) =>
        calcPrimaryScore(
          candidate.charEP,
          candidate.charSP,
          candidate.partyEcon ?? 0,
          candidate.partySocial ?? 0,
          candidate.favorability,
          candidate.politicalInfluence,
          candidate.infamy,
          audience.context.stateEconomicLean,
          audience.context.stateSocialLean
        ) * (candidate.isNPP ? NPP_PRIMARY_SCORE_MULTIPLIER : 1)
    );
    const adjusted = primarySharePctSoftmax(
      scores.map((score, index) =>
        campaignPrimaryScore(
          score,
          meanAdBonus(cells, bonusesByCandidate[enriched[index].candidateId]),
          PRIMARY_SHARE_SOFTMAX_TEMPERATURE
        )
      )
    );
    const registration = partyOrgs.find((org) => org.partyId === character.party)?.registration;
    const pool =
      substrate.totalPool *
      (typeof registration === "number" ? Math.min(100, Math.max(0, registration)) / 100 : 1);
    return {
      ...base,
      totalPool: pool,
      votes: Object.fromEntries(
        enriched.map((candidate, i) => [candidate.candidateId, (adjusted[i] / 100) * pool])
      ),
    };
  }
  let electorate = substrate.electorate;
  let liveTurnouts = substrate.liveTurnouts;
  if (inPrimary) {
    const position = {
      economicPosition: enriched[0]?.partyEcon ?? 0,
      socialPosition: enriched[0]?.partySocial ?? 0,
    };
    electorate = shiftElectorateForPrimary(substrate.electorate, position);
    liveTurnouts = applyPrimaryTurnoutRetention(
      substrate.liveTurnouts,
      substrate.electorate,
      position
    );
  }

  const distribute = inPrimary ? distributeVotesByGroupLevelAllocation : distributeVotesBySwingFlow;
  const result = distribute(
    substrate.enriched,
    substrate.totalPool,
    substrate.totalPool,
    audience.context.statePopulation,
    electorate,
    new Map(partyOrgs.map((org) => [org.partyId, org.organization])),
    {
      isGeneralElection: !inPrimary,
      currentStateId: character.homeState,
      countryId: character.countryId,
      liveTurnouts,
      useAveragedPositions: presidential && !inPrimary,
      partyPositionWeight: presidential ? 1 / 3 : undefined,
      useNationalInfluenceForReach: presidential,
      presidentialPrimaryNationalReach: presidential && inPrimary,
      hasPlayerInRace: true,
      votingSystem: presidential ? "rcv" : audience.context.votingSystem,
    }
  );
  return { ...base, votes: result.votesPerCandidate };
}

export type CampaignPollProjection = NonNullable<Awaited<ReturnType<typeof projectCampaignPoll>>>;
