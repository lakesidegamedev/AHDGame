/**
 * Which campaign in a race is "the viewer's own". A viewer can sit on a
 * campaign as the candidate, an appointed manager or the running mate; when
 * more than one applies the candidate role wins, then manager, then running
 * mate, and a live campaign beats an archived one.
 */

export interface RaceCampaignRow {
  id: string;
  candidateId: string;
  archived: boolean;
  /** Every user id appointed to manage the campaign. */
  managerUserIds: readonly string[];
}

export interface ViewerRaceCampaignInput {
  campaigns: readonly RaceCampaignRow[];
  userId: string;
  /** Every character the viewer's account owns. */
  ownedCharacterIds: ReadonlySet<string>;
  /** Candidate characters in this race whose running mate the viewer owns. */
  ticketsAsRunningMate: ReadonlySet<string>;
}

const ROLE_CANDIDATE = 3;
const ROLE_MANAGER = 2;
const ROLE_RUNNING_MATE = 1;
const LIVE_BONUS = 10;

function roleOf(row: RaceCampaignRow, input: ViewerRaceCampaignInput): number {
  if (input.ownedCharacterIds.has(row.candidateId)) return ROLE_CANDIDATE;
  if (row.managerUserIds.includes(input.userId)) return ROLE_MANAGER;
  if (input.ticketsAsRunningMate.has(row.candidateId)) return ROLE_RUNNING_MATE;
  return 0;
}

export function pickViewerRaceCampaign(input: ViewerRaceCampaignInput): string | null {
  let best: { id: string; score: number } | null = null;
  for (const row of input.campaigns) {
    const role = roleOf(row, input);
    if (role === 0) continue;
    const score = role + (row.archived ? 0 : LIVE_BONUS);
    if (!best || score > best.score) best = { id: row.id, score };
  }
  return best?.id ?? null;
}
