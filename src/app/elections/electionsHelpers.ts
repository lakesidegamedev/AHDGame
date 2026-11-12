import { electionRegionUrl } from "@/lib/urls";
import type { ElectionDisplay } from "@/lib/db/types";
import { isCloseRace } from "@/lib/elections/rules/closeRace";
import { raceHref } from "@/lib/campaignManager/links";
import { US_STATE_NAMES } from "@/lib/constants/usStateNames";

export type ElectionType =
  "senate" | "house" | "stateSenate" | "governor" | "president" | "commons" | "primeMinister";

export function leaderColor(election: ElectionDisplay): string {
  const leaderId = election.polling?.leaderId;
  if (!leaderId) return "var(--muted)";
  return election.polling?.candidatePartyColors?.[leaderId] ?? "var(--muted)";
}

export const SENATE_CLASS_ROMAN: Record<number, string> = { 1: "I", 2: "II", 3: "III" };

export const ELECTION_STATE_NAMES: Record<string, string> = {
  US: "National",
  ...US_STATE_NAMES,
};

/** The shared "Close" rule (see `@/lib/elections/rules/closeRace`). */
export function isCompetitiveElection(e: ElectionDisplay): boolean {
  return isCloseRace({ inPrimary: e.inPrimary, sharesPct: e.polling?.sharesPct });
}

/**
 * Where a race links to: Campaign Manager with the race selected, or the
 * presidency's own page (see `raceHref`).
 */
export function buildElectionHref(election: {
  id: string;
  seatId?: string | null;
  electionType: string;
}): string {
  return raceHref(election);
}

/**
 * Builds an election state detail page URL (county/CD results).
 * Uses seatId for the election path when available.
 */
export function buildElectionStateHref(
  election: { id: string; seatId?: string },
  countryId: string,
  stateId: string
): string {
  return electionRegionUrl(election.seatId ?? election.id, countryId, stateId);
}
