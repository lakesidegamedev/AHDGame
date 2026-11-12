/**
 * How many candidates one party may put on a single race, and the shared
 * accounting callers use to decide whether another fits.
 *
 * One pool covers players and NPPs together. Three callers must agree: the
 * slate assignment route, the turn's filing pass, and the Slate tab.
 *
 * Consumes a slot: a live slate row (invited/considering/accepted/filed,
 * including ones carried forward from a template), or an active NPP candidacy
 * created by party-fill (no slate row).
 *
 * Does not: a declined or withdrawn slate row, or a player who filed their own
 * candidacy (charging the slate would let self-filers shrink the chair's
 * board).
 *
 * Slots count per candidate: a filed row and its candidacy are one slot.
 */
import type { SlateCandidateStatus } from "@/lib/db/types";

/** Maximum candidates one party may have assigned to a single race. */
export const SLATE_ASSIGNMENT_CAP = 3;

/** Slate row statuses that hold a slot. */
const LIVE_SLATE_STATUSES: ReadonlySet<SlateCandidateStatus> = new Set<SlateCandidateStatus>([
  "invited",
  "considering",
  "accepted",
  "filed",
]);

/** The fields of a `SlateCandidate` this accounting reads. */
export interface SlateUsageRow {
  candidateId: string;
  status: SlateCandidateStatus;
}

/**
 * The fields of an `ElectionCandidate` this accounting reads.
 *
 * Both NPP markers are optional on the stored document and rows predating the
 * `isNPP` flag carry only `nppId`, so the two are read together here rather
 * than leaving each caller to pick one and undercount the older rows.
 */
export interface SlateUsageCandidacy {
  characterId: string;
  isNPP?: boolean | null;
  nppId?: unknown;
  status: string;
}

function isNppCandidacy(candidacy: SlateUsageCandidacy): boolean {
  return candidacy.isNPP === true || candidacy.nppId != null;
}

export interface SlateAssignmentUsage {
  /** Slots currently held. May exceed `cap` for a race assigned before the cap existed. */
  used: number;
  cap: number;
  /** Slots still free, never negative. */
  remaining: number;
}

export function isLiveSlateStatus(status: SlateCandidateStatus): boolean {
  return LIVE_SLATE_STATUSES.has(status);
}

/**
 * The line the Slate tab shows a chair on each race, telling them how many
 * candidates may stand there and how much of that is spent.
 *
 * Kept beside the accounting so the wording and the figures cannot drift
 * apart, and so the one place the rule is explained to a player is the same
 * place the rule is defined.
 */
export function formatSlateCapNote(usage: SlateAssignmentUsage): string {
  const { used, cap } = usage;
  if (used > cap) {
    return `This race holds ${used} candidates, above the limit of ${cap}. The next turn will withdraw the extra.`;
  }
  if (used === cap) {
    return `This race is full at ${cap} candidates, players and NPPs sharing the same ${cap} slots. Withdraw one to assign someone else.`;
  }
  return `Up to ${cap} candidates may be assigned to this race, players and NPPs sharing the same ${cap} slots. ${used} of ${cap} used.`;
}

/**
 * Count the slots one party holds on one race.
 *
 * Both arguments must already be scoped to a single (election, party) pair;
 * this function does no filtering of its own beyond status.
 */
export function countSlateAssignmentUsage(
  rows: readonly SlateUsageRow[],
  candidacies: readonly SlateUsageCandidacy[]
): SlateAssignmentUsage {
  const holders = new Set<string>();
  for (const row of rows) {
    if (isLiveSlateStatus(row.status)) holders.add(row.candidateId);
  }
  for (const candidacy of candidacies) {
    if (candidacy.status !== "active") continue;
    // A player on the ballot never spends a party slot; an NPP already counted
    // through its slate row must not be counted twice.
    if (!isNppCandidacy(candidacy)) continue;
    holders.add(candidacy.characterId);
  }

  const used = holders.size;
  return {
    used,
    cap: SLATE_ASSIGNMENT_CAP,
    remaining: Math.max(0, SLATE_ASSIGNMENT_CAP - used),
  };
}
