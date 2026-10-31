import { yearOfTurn } from "@/lib/utils/gameDate";

/** Start once, including its announcement, for the same running vacancy snap. */
export function shouldStartVacancySnap(
  hasLiveSnap: boolean,
  previousSnapTurn: number | null | undefined,
  currentTurn: number
): boolean {
  return !hasLiveSnap && (previousSnapTurn ?? -1) < currentTurn;
}

/** A confidence collapse can dissolve a sitting government, never a vacancy. */
export function canDissolveOnConfidence(
  status: string | null | undefined,
  hasPrimeMinister: boolean
): boolean {
  return status === "formed" && hasPrimeMinister;
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
