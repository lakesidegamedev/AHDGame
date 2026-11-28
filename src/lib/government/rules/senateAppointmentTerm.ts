import { MS_PER_TURN, TURNS_PER_YEAR } from "@/lib/constants/turnTime";
/** A vacancy ends at the next class election, or after six game years if none is scheduled. */
export function senateAppointmentTermEnd(nowMs: number, electionEndMs?: number): number {
  return typeof electionEndMs === "number" &&
    Number.isFinite(electionEndMs) &&
    electionEndMs > nowMs
    ? electionEndMs
    : nowMs + 6 * TURNS_PER_YEAR * MS_PER_TURN;
}
