/**
 * Election-night chrome: which race types get a national board, which race
 * anchors it, and how the board is titled.
 *
 * Split out of `electionNight.ts` so a list page can decide whether to show an
 * embed without pulling the national seat aggregation with it. That file also
 * carries the aggregation itself, which reaches the turn engine's seat
 * allocation tables (states, chamber seats, PR rules) and has no business in a
 * page that only picks an anchor.
 */
import {
  CHAMBER_LABELS,
  NATIONAL_AGGREGATION_TYPES,
  WESTMINSTER_STYLE_TYPES,
} from "./computeResults";

export interface ElectionNightAnchorCandidate {
  id: string;
  electionType: string;
  status: string;
}

/** True when this election type participates in the national election-night board. */
export function isElectionNightType(electionType: string): boolean {
  return NATIONAL_AGGREGATION_TYPES.has(electionType);
}

/**
 * Prefer an active national multi-seat race; fall back to a completed/resolved
 * one. Shared by country elections embeds (UK Commons, US House, ...).
 */
export function pickElectionNightAnchor(
  elections: ElectionNightAnchorCandidate[]
): ElectionNightAnchorCandidate | null {
  const eligible = elections.filter((e) => isElectionNightType(e.electionType));
  return (
    eligible.find((e) => e.status === "active") ??
    eligible.find((e) => e.status === "completed" || e.status === "resolved") ??
    null
  );
}

/** Human title for the election-night chrome (embed header / results page). */
export function electionNightTitle(electionType: string): string {
  const chamber = CHAMBER_LABELS[electionType];
  return chamber ? `Election Night · ${chamber}` : "Election Night";
}

export function electionNightStyle(electionType: string): "westminster" | "generic" {
  return WESTMINSTER_STYLE_TYPES.has(electionType) ? "westminster" : "generic";
}

export function majorityThreshold(totalSeats: number): number {
  return Math.floor(totalSeats / 2) + 1;
}

export type ElectionNightBoardState = "live" | "result" | "idle";

interface BoardStateInput {
  election: { status: string };
  summary: { totalVotes: number; unitsReporting: number };
  national: { regionsDeclared: number } | null;
}

/**
 * What the national board should show. A race that has not started counting
 * has nothing to report, so it is "idle" and the page shows no zero board. A
 * finished race keeps its last result.
 */
export function electionNightBoardState(data: BoardStateInput): ElectionNightBoardState {
  if (data.election.status === "completed" || data.election.status === "resolved") return "result";
  const counting =
    data.summary.totalVotes > 0 ||
    data.summary.unitsReporting > 0 ||
    (data.national?.regionsDeclared ?? 0) > 0;
  return counting ? "live" : "idle";
}
