/** Canadian Commons timer repair preserves the scheduled term after a snap. */
import type { Election } from "@/lib/db/types";
import { shiftedAnchorTurn } from "@/lib/elections/snapShift";
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

/** Undefined delegates foreign history to its owner; null keeps an unshifted Canadian calendar. */
export function canadianRecalibrationAnchor(
  election: Pick<
    Election,
    "countryId" | "electionType" | "endTime" | "endTurn" | "imposedSnap" | "shiftedScheduleEndTurn"
  >,
  endTimeToTurn: (time: Date) => number
): number | null | undefined {
  if (election.countryId !== "CA" || election.electionType.replace(/^snap_/, "") !== "caCommons")
    return undefined;
  return shiftedAnchorTurn(
    election,
    "caCommons",
    "snap_caCommons",
    () => election.endTurn ?? endTimeToTurn(election.endTime)
  );
}
