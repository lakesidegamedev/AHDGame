import { STARTING_YEAR, TURNS_PER_YEAR } from "@/lib/constants/turnTime";

/**
 * World year for build pricing: the game state's explicit `currentYear` when
 * present, else derived from the turn counter.
 */
export function resolveWorldYear(
  currentYear: number | null | undefined,
  currentTurn: number | null | undefined
): number {
  if (typeof currentYear === "number" && Number.isFinite(currentYear)) return currentYear;
  const turn = typeof currentTurn === "number" && Number.isFinite(currentTurn) ? currentTurn : 0;
  return STARTING_YEAR + Math.floor((Math.max(1, turn) - 1) / TURNS_PER_YEAR);
}
