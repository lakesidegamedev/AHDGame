import { yearOfTurn } from "@/lib/utils/gameDate";

/** Announce the start, not subsequent visits to the same running vacancy snap. */
export function shouldAnnounceVacancySnap(
  hasLiveSnap: boolean,
  previousSnapTurn: number | null | undefined,
  currentTurn: number
): boolean {
  return !hasLiveSnap && (previousSnapTurn ?? -1) < currentTurn;
}

export interface SnapElectionCalendar {
  startingYear: number;
  preIterationActive?: boolean;
  preIterationTurns?: number;
}

/**
 * Label a snap election with the in-game year in which its general election
 * resolves. Snap cycles retain ordinary cycle numbering for future scheduling,
 * but their short, immediate timetable is independent of the canonical cycle's
 * year.
 */
export function snapElectionResolutionYear(
  endTurn: number,
  calendar: SnapElectionCalendar
): number {
  return yearOfTurn(endTurn, calendar.startingYear, {
    preIterationActive: calendar.preIterationActive,
    preIterationTurns: calendar.preIterationTurns,
  });
}
