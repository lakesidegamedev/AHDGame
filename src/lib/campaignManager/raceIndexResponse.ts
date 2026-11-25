import type { EnrichedCandidate, PartyGroup } from "@/lib/elections/candidateEnrichment";
import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";

export type RaceIndexCandidate = Pick<
  EnrichedCandidate,
  | "id"
  | "characterId"
  | "nppId"
  | "characterDbId"
  | "nppDbId"
  | "characterName"
  | "avatarUrl"
  | "party"
  | "partyName"
  | "partyAbbr"
  | "partyColor"
  | "favorability"
  | "politicalInfluence"
  | "isYou"
  | "isNPP"
  | "endorsements"
  | "sharePct"
>;

export type RaceIndexElection = Pick<
  ElectionResponse,
  | "id"
  | "electionType"
  | "state"
  | "senateClass"
  | "chamberClass"
  | "totalSeats"
  | "electionYear"
  | "resolvedYear"
  | "cycle"
  | "seatId"
  | "isEnded"
  | "isUpcoming"
  | "inPrimary"
  | "inGeneral"
  | "startTurn"
  | "primaryEndTurn"
  | "endTurn"
  | "seatsEstimate"
  | "primaryAdvanceCount"
  | "primaryResults"
> & {
  candidates: RaceIndexCandidate[];
  allCandidates: RaceIndexCandidate[] | null;
  byParty: Array<Pick<PartyGroup, "partyId" | "partyName"> & { candidates: RaceIndexCandidate[] }>;
  polling: Pick<NonNullable<ElectionResponse["polling"]>, "sharesPct"> | null;
  generalVotes: Pick<NonNullable<ElectionResponse["generalVotes"]>, "totalVotes"> | null;
};

function raceIndexCandidate(candidate: EnrichedCandidate): RaceIndexCandidate {
  return {
    id: candidate.id,
    characterId: candidate.characterId,
    nppId: candidate.nppId,
    characterDbId: candidate.characterDbId,
    nppDbId: candidate.nppDbId,
    characterName: candidate.characterName,
    avatarUrl: candidate.avatarUrl,
    party: candidate.party,
    partyName: candidate.partyName,
    partyAbbr: candidate.partyAbbr,
    partyColor: candidate.partyColor,
    favorability: candidate.favorability,
    politicalInfluence: candidate.politicalInfluence,
    isYou: candidate.isYou,
    isNPP: candidate.isNPP,
    endorsements: candidate.endorsements,
    sharePct: candidate.sharePct,
  };
}

/** Keep the fields used by the race index and one candidate list for the current stage. */
export function raceIndexResponse(election: ElectionResponse): RaceIndexElection {
  const primary = election.inPrimary && !election.isEnded;
  return {
    id: election.id,
    electionType: election.electionType,
    state: election.state,
    senateClass: election.senateClass,
    chamberClass: election.chamberClass,
    totalSeats: election.totalSeats,
    electionYear: election.electionYear,
    resolvedYear: election.resolvedYear,
    cycle: election.cycle,
    seatId: election.seatId,
    isEnded: election.isEnded,
    isUpcoming: election.isUpcoming,
    inPrimary: election.inPrimary,
    inGeneral: election.inGeneral,
    startTurn: election.startTurn,
    primaryEndTurn: election.primaryEndTurn,
    endTurn: election.endTurn,
    seatsEstimate: election.seatsEstimate,
    primaryAdvanceCount: election.primaryAdvanceCount,
    primaryResults: election.primaryResults,
    candidates: primary ? [] : election.candidates.map(raceIndexCandidate),
    allCandidates: primary ? null : (election.allCandidates?.map(raceIndexCandidate) ?? null),
    byParty: primary
      ? (election.byParty ?? []).map(({ partyId, partyName, candidates }) => ({
          partyId,
          partyName,
          candidates: candidates.map(raceIndexCandidate),
        }))
      : [],
    polling: !primary && election.polling ? { sharesPct: election.polling.sharesPct } : null,
    generalVotes: election.generalVotes ? { totalVotes: election.generalVotes.totalVotes } : null,
  };
}
