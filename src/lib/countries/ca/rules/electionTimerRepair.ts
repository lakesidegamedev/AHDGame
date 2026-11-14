/** Canadian Commons timer repair preserves the scheduled term after a snap. */
import { DEFAULT_DURATIONS } from "@/lib/constants/electionDurations";

export function canadianShiftedTimerTurns(election: {
  countryId?: string;
  electionType: string;
  cycle: number;
  shiftedScheduleEndTurn?: number;
}) {
  if (
    election.countryId !== "CA" ||
    election.electionType !== "caCommons" ||
    !Number.isSafeInteger(election.shiftedScheduleEndTurn) ||
    !(election.shiftedScheduleEndTurn! > 0)
  )
    return null;
  const endTurn = election.shiftedScheduleEndTurn!;
  const duration = DEFAULT_DURATIONS.caCommons;
  return {
    endTurn,
    primaryEndTurn: endTurn - duration.generalDurationHours,
    startTurn: election.cycle === 1 ? 1 : endTurn - duration.durationHours,
  };
}
