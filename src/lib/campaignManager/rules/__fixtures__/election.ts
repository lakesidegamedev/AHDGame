import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";

export type Cand = {
  id: string;
  name: string;
  party: string;
  share?: number;
  isYou?: boolean;
  isNPP?: boolean;
};

export function cand(c: Cand) {
  return {
    id: c.id,
    characterId: c.isNPP ? null : `ch-${c.id}`,
    nppId: c.isNPP ? `n-${c.id}` : null,
    characterName: c.name,
    party: c.party,
    partyName: `Party ${c.party}`,
    partyColor: c.party === "1" ? "#2563eb" : "#dc2626",
    favorability: 50,
    politicalInfluence: 20,
    isYou: !!c.isYou,
    isNPP: !!c.isNPP,
    sharePct: c.share ?? 0,
  };
}

export function election(over: Partial<ElectionResponse> & { cands?: Cand[] }): ElectionResponse {
  const cands = (over.cands ?? []).map(cand);
  const shares = Object.fromEntries((over.cands ?? []).map((c) => [c.id, c.share ?? 0]));
  return {
    id: "e1",
    electionType: "senate",
    state: "OH",
    countryId: "US",
    senateClass: null,
    chamberClass: null,
    status: "active",
    totalSeats: null,
    inPrimary: false,
    isEnded: false,
    inGeneral: true,
    isUpcoming: false,
    endTurn: 12,
    primaryEndTurn: 6,
    candidates: cands,
    byParty: [],
    polling: { sharesPct: shares },
    seatsEstimate: null,
    ...over,
  } as unknown as ElectionResponse;
}
