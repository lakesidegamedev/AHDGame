/**
 * Which campaign controls the presidential map's state panel offers, and the
 * data the map's "Your campaign" layer needs. Plain data in and out.
 *
 * Nothing here decides what a viewer may do: the server already withholds the
 * state presence payload and the state operations hub from anyone who may not
 * use them, and these helpers only read that. They exist so the panel shows a
 * control exactly when its data came back.
 */

/** The map is the way into a state's campaign actions on US races only. */
export function campaignMapIsEntry(countryId: string | null | undefined): boolean {
  // eslint-disable-next-line local/no-country-literals -- the presidential map is the US state map
  return countryId === "US";
}

export interface StateActionInput {
  stateId: string;
  accessLevel: "owner" | "party" | "public";
  /** The campaign payload carried state presence (the server sends it to the candidate only). */
  hasStatePresence: boolean;
  /** The state operations hub loaded (the server answers it for a candidate only). */
  hasOperations: boolean;
  /** The viewer may run the campaign (not a running mate, not archived or suspended). */
  canManage: boolean;
  /** The one state canvassing is open in for this viewer, or null. */
  canvassStateId: string | null;
}

export interface StateActionSections {
  /** Travel, camping and the home-state surge. */
  movement: boolean;
  /** Attacks and what is live in this state. */
  operations: boolean;
  /** The canvassing desk. */
  canvass: boolean;
  /** "Your campaign here": presence level and the way into field offices. */
  presenceBlock: boolean;
}

export function stateActionSections(input: StateActionInput): StateActionSections {
  const owner = input.accessLevel === "owner";
  return {
    movement: owner && input.hasStatePresence,
    operations: owner && input.hasOperations,
    canvass: owner && input.canManage && input.canvassStateId === input.stateId,
    presenceBlock: owner,
  };
}

/** The state canvassing is open in, from the eligibility route's answer. */
export function canvassStateFromEligibility(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const { ok, stateId } = body as { ok?: unknown; stateId?: unknown };
  return ok === true && typeof stateId === "string" && stateId ? stateId : null;
}

export interface RacePresenceEntry {
  characterId: string;
  levelsByState: Record<string, number>;
}

/** One candidate's Campaign Presence by state, from the public race-wide list. */
export function presenceLevelsFor(
  racePresence: readonly RacePresenceEntry[] | null | undefined,
  candidateId: string | null | undefined
): Record<string, number> {
  if (!racePresence || !candidateId) return {};
  return racePresence.find((e) => e.characterId === candidateId)?.levelsByState ?? {};
}

/**
 * How the viewer builds Campaign Presence for the campaign on screen.
 * `own`: the candidate, who builds from their own list. `campaign`: an appointed
 * manager, who builds for the ticket by naming the campaign. `null`: the running
 * mate, a rival or anyone else, who gets no build button. The server decides the
 * same way and is the authority; this only keeps the button to people it serves.
 */
export type PresenceBuildAccess = { kind: "own" } | { kind: "campaign"; campaignId: string } | null;

export function presenceBuildAccess(input: {
  viewerIsCandidate: boolean;
  /** The viewer may run the campaign (not a running mate, not archived or suspended). */
  canManage: boolean;
  campaignId: string | null | undefined;
}): PresenceBuildAccess {
  if (input.viewerIsCandidate) return { kind: "own" };
  if (input.canManage && input.campaignId)
    return { kind: "campaign", campaignId: input.campaignId };
  return null;
}

export interface SubjectCandidate {
  characterId: string;
  isNPP?: boolean;
  nppId?: string | null;
  isYou: boolean;
  campaignId?: string | null;
  campaignColor?: string | null;
  partyColor?: string | null;
}

export interface PresenceSubject {
  /** The id Campaign Presence is stored under for this ticket. */
  candidateId: string;
  /** The viewer is the candidate. A manager builds for them too; see `presenceBuildAccess`. */
  viewerIsCandidate: boolean;
  color: string;
}

const FALLBACK_COLOR = "#4F8EF7";

/**
 * Whose presence the map shows as "your campaign": the viewer's campaign in
 * the race, whether they are the candidate, a manager or the running mate.
 * Falls back to the viewer's own candidacy when it has no campaign id yet.
 */
export function presenceSubject(
  candidates: readonly SubjectCandidate[],
  campaignId: string | null | undefined
): PresenceSubject | null {
  const match =
    (campaignId ? candidates.find((c) => c.campaignId === campaignId) : undefined) ??
    candidates.find((c) => c.isYou);
  if (!match) return null;
  return {
    candidateId: match.isNPP && match.nppId ? match.nppId : match.characterId,
    viewerIsCandidate: match.isYou,
    color: match.campaignColor ?? match.partyColor ?? FALLBACK_COLOR,
  };
}
