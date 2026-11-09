/**
 * What a vacant executive office needs once its acting period is over, and how
 * the sitting succession is described to players. Plain data in, plain data out.
 */

import type { SuccessionFill, SuccessionStage } from "./executiveSuccession";
import { successionStage } from "./executiveSuccession";
import { isCaretakerActive, type CaretakerGovernmentView, type CaretakerState } from "./caretaker";

/** Turns a special presidential election keeps its filing window open. */
export const SUCCESSION_ELECTION_FILING_TURNS = 24;
/** Turns the general phase of a special presidential election runs. */
export const SUCCESSION_ELECTION_GENERAL_TURNS = 24;
/** After a special election resolves with the office still empty, wait this long before another. */
export const SUCCESSION_ELECTION_RETRY_COOLDOWN_TURNS = 48;

/** Presets where a country's presidency already runs on its own constitutional ballot machinery. */
const OWN_PRESIDENTIAL_BALLOT_PRESETS: Readonly<Record<string, readonly string[]>> = {
  RU: ["1991-default"],
};

export function ownsPresidentialBallot(countryId: string, preset: string | undefined): boolean {
  return (
    preset !== undefined && OWN_PRESIDENTIAL_BALLOT_PRESETS[countryId]?.includes(preset) === true
  );
}

const OWN_BALLOT_NOTE =
  "This presidency is filled through its own constitutional ballot, so no special election is scheduled here.";

export type SuccessionFillAction = "none" | "spawn_election" | "hold_vote";

/** Deterministic rng from a string seed, so the same vacancy and turn always elect the same member. */
export function seededRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface OpenSuccession {
  fill: SuccessionFill;
  actingUntilTurn: number;
  fillByTurn: number;
}

/**
 * The fill step due this turn. Deputies and government formation have their own
 * engines, so only an election, a legislature vote or a party vote is acted on,
 * and only once the acting period has run out.
 */
export function successionFillAction(
  succession: OpenSuccession,
  currentTurn: number
): SuccessionFillAction {
  if (successionStage(succession, currentTurn) === "acting") return "none";
  switch (succession.fill) {
    case "direct_election":
      return "spawn_election";
    case "legislature_vote":
    case "party_vote":
      return "hold_vote";
    default:
      return "none";
  }
}

export interface SuccessorCandidate {
  id: string;
  party: string;
}

/**
 * The bloc that votes is the party holding the most seats among the eligible
 * members. Ties go to the lowest party id so the result is stable.
 */
export function largestBlocParty(candidates: readonly SuccessorCandidate[]): string | null {
  const counts = new Map<string, number>();
  for (const c of candidates) counts.set(c.party, (counts.get(c.party) ?? 0) + 1);
  let best: string | null = null;
  for (const [party, count] of counts) {
    if (best === null) best = party;
    else {
      const bestCount = counts.get(best) ?? 0;
      if (count > bestCount || (count === bestCount && party < best)) best = party;
    }
  }
  return best;
}

/** Picks the winner of a legislature or party vote from the largest bloc. Null with no candidates. */
export function pickSuccessor(
  candidates: readonly SuccessorCandidate[],
  rng: () => number
): SuccessorCandidate | null {
  const party = largestBlocParty(candidates);
  if (party === null) return null;
  const bloc = candidates.filter((c) => c.party === party).sort((a, b) => a.id.localeCompare(b.id));
  return bloc[Math.min(bloc.length - 1, Math.floor(rng() * bloc.length))] ?? null;
}

export interface SuccessionViewInput {
  office: string;
  fill: SuccessionFill;
  actingLabel: string;
  vacatedTurn: number;
  actingUntilTurn: number;
  fillByTurn: number;
  overdue: boolean;
}

export interface SuccessionView {
  stage: SuccessionStage;
  office: string;
  actingLabel: string;
  fill: SuccessionFill;
  vacatedTurn: number;
  actingUntilTurn: number;
  fillByTurn: number;
  /** Short line for a status strip. */
  summary: string;
  /** Extra line when the office is not filled by the usual route, null otherwise. */
  note: string | null;
}

const FILL_PHRASE: Record<SuccessionFill, string> = {
  deputy_permanent: "the deputy takes over",
  direct_election: "a special election",
  legislature_vote: "a vote of the legislature",
  party_vote: "a vote of the ruling party",
  government_formation: "a new government",
};

/** The player-facing description of an open succession. */
export function describeSuccession(
  succession: SuccessionViewInput,
  currentTurn: number,
  ownBallot = false
): SuccessionView {
  const stage = successionStage(succession, currentTurn);
  const phrase = FILL_PHRASE[succession.fill];
  const summary =
    stage === "acting"
      ? `Office vacant. ${succession.actingLabel} is acting until ${phrase}.`
      : stage === "awaiting_fill"
        ? `Office vacant. Awaiting ${phrase}.`
        : `Office vacant and overdue. Awaiting ${phrase}.`;
  return {
    stage,
    office: succession.office,
    actingLabel: succession.actingLabel,
    fill: succession.fill,
    vacatedTurn: succession.vacatedTurn,
    actingUntilTurn: succession.actingUntilTurn,
    fillByTurn: succession.fillByTurn,
    summary,
    note: ownBallot && succession.fill === "direct_election" ? OWN_BALLOT_NOTE : null,
  };
}

export interface ExecutiveStatusPayload {
  /** Open succession for a vacant top office, null when the office is held. */
  succession: SuccessionView | null;
  /** Caretaker mode after a dissolution, null when none applies. */
  caretaker: CaretakerState | null;
}

export interface ExecutiveStatusDocument extends CaretakerGovernmentView {
  succession?: SuccessionViewInput | null;
}

/** The succession and caretaker state a hub or API consumer needs, from the government document. */
export function executiveStatusPayload(
  gov: ExecutiveStatusDocument | null | undefined,
  currentTurn: number,
  ownBallot = false
): ExecutiveStatusPayload {
  return {
    succession: gov?.succession ? describeSuccession(gov.succession, currentTurn, ownBallot) : null,
    caretaker: isCaretakerActive(gov) ? (gov?.caretaker ?? null) : null,
  };
}
