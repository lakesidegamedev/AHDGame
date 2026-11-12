/**
 * Pure schedule for the by-elections a fresh 2027 UK world opens with.
 *
 * Mid-term vacancies normally come from play, so a world with no general
 * election before 2029 would sit through its first year with no vote at all.
 * This table vacates a few NPP-held constituency seats on fixed calendar turns
 * and lets the ordinary by-election watcher fill them.
 *
 * Plain data in, plain data out: the caller supplies the calendar turn and the
 * candidate seats, and decides what to write.
 */

export const YEAR_ONE_BY_ELECTION_PRESET = "2027-default";

const TURNS_PER_YEAR = 48;

export interface YearOneByElectionEntry {
  /** 1-based calendar turn of the world, counted from the start of the preset year. */
  calendarTurn: number;
  reason: "retirement" | "resignation";
  /** Position in the sorted candidate list, as a fraction in [0, 1). */
  seatDraw: number;
}

export const YEAR_ONE_BY_ELECTION_SCHEDULE: readonly YearOneByElectionEntry[] = [
  { calendarTurn: 9, reason: "retirement", seatDraw: 0.17 },
  { calendarTurn: 19, reason: "resignation", seatDraw: 0.62 },
  { calendarTurn: 30, reason: "retirement", seatDraw: 0.38 },
  { calendarTurn: 41, reason: "resignation", seatDraw: 0.84 },
];

/** Throws unless every entry is a distinct turn inside the first year with a draw in [0, 1). */
export function validateYearOneSchedule(schedule: readonly YearOneByElectionEntry[]): void {
  if (schedule.length === 0) throw new Error("Year-one by-election schedule is empty");
  const seen = new Set<number>();
  for (const entry of schedule) {
    if (
      !Number.isInteger(entry.calendarTurn) ||
      entry.calendarTurn < 1 ||
      entry.calendarTurn > TURNS_PER_YEAR
    ) {
      throw new Error(`Year-one by-election turn ${entry.calendarTurn} is outside the first year`);
    }
    if (seen.has(entry.calendarTurn)) {
      throw new Error(`Year-one by-election turn ${entry.calendarTurn} is listed twice`);
    }
    seen.add(entry.calendarTurn);
    if (!Number.isFinite(entry.seatDraw) || entry.seatDraw < 0 || entry.seatDraw >= 1) {
      throw new Error(`Year-one by-election draw ${entry.seatDraw} is outside [0, 1)`);
    }
  }
}

validateYearOneSchedule(YEAR_ONE_BY_ELECTION_SCHEDULE);

export function yearOneEntryForTurn(
  calendarTurn: number,
  schedule: readonly YearOneByElectionEntry[] = YEAR_ONE_BY_ELECTION_SCHEDULE
): YearOneByElectionEntry | undefined {
  return schedule.find((entry) => entry.calendarTurn === calendarTurn);
}

/** Pick one candidate by draw from the id-sorted list, so the same world picks the same seat. */
export function pickYearOneSeat<T extends { id: string }>(
  candidates: readonly T[],
  seatDraw: number
): T | undefined {
  if (candidates.length === 0) return undefined;
  const sorted = [...candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sorted[Math.min(sorted.length - 1, Math.floor(seatDraw * sorted.length))];
}
