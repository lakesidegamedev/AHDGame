import { US_STATE_AND_DC_NAMES } from "@/lib/constants/usStateNames";
import type { CandidateDetail, GeneralVotes } from "./ElectionDetailTypes";

// State name mapping
export const STATE_NAMES = US_STATE_AND_DC_NAMES;

// State regions for regional breakdown
export const STATE_REGIONS: Record<string, string> = {
  CT: "Northeast",
  DE: "Northeast",
  MA: "Northeast",
  MD: "Northeast",
  ME: "Northeast",
  NH: "Northeast",
  NJ: "Northeast",
  NY: "Northeast",
  PA: "Northeast",
  RI: "Northeast",
  VT: "Northeast",
  AL: "South",
  AR: "South",
  FL: "South",
  GA: "South",
  KY: "South",
  LA: "South",
  MS: "South",
  NC: "South",
  SC: "South",
  TN: "South",
  VA: "South",
  WV: "South",
  IA: "Midwest",
  IL: "Midwest",
  IN: "Midwest",
  KS: "Midwest",
  MI: "Midwest",
  MN: "Midwest",
  MO: "Midwest",
  ND: "Midwest",
  NE: "Midwest",
  OH: "Midwest",
  SD: "Midwest",
  WI: "Midwest",
  AZ: "West",
  AK: "West",
  CA: "West",
  CO: "West",
  HI: "West",
  ID: "West",
  MT: "West",
  NM: "West",
  NV: "West",
  OK: "West",
  OR: "West",
  TX: "West",
  UT: "West",
  WA: "West",
  WY: "West",
};

export interface StateResult {
  stateId: string;
  stateName: string;
  ev: number;
  winnerId: string;
  winnerName: string;
  winnerColor: string;
  margin: number;
  winnerPct: number;
  totalVotes: number;
}

/** Per-state winner, margin and turnout from a general-election tally. */
export function computeStateResults(
  stateVoteData: GeneralVotes["stateVoteData"],
  evByState: GeneralVotes["evByState"],
  candidates: CandidateDetail[],
  colorMap: Map<string, string>
): StateResult[] {
  if (!stateVoteData) return [];

  const results: StateResult[] = [];
  for (const [stateId, data] of Object.entries(stateVoteData)) {
    const stateVotes = Object.entries(data.votesByCandidate);
    if (stateVotes.length === 0) continue;

    const sorted = stateVotes.sort((a, b) => b[1] - a[1]);
    const winnerId = sorted[0][0];
    const winner = candidates.find((c) => c.id === winnerId);
    if (!winner) continue;

    const totalVotes = stateVotes.reduce((sum, [, votes]) => sum + votes, 0);
    const winnerVotes = sorted[0][1];
    const secondVotes = sorted[1]?.[1] ?? 0;
    const winnerPct = totalVotes > 0 ? (winnerVotes / totalVotes) * 100 : 0;
    const margin = totalVotes > 0 ? ((winnerVotes - secondVotes) / totalVotes) * 100 : 0;

    results.push({
      stateId,
      stateName: STATE_NAMES[stateId] || stateId,
      ev: evByState?.[stateId] ?? 0,
      winnerId,
      winnerName: winner.characterName,
      winnerColor: colorMap.get(winnerId)!,
      margin,
      winnerPct,
      totalVotes,
    });
  }

  return results;
}
