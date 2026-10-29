import { clamp } from "@/lib/numeric/rules";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";

/**
 * Closed-form war exhaustion curve: +1 while the war is fresh, falling one
 * point per in-game year to a floor of -25. Pure, so the wiki charts and the
 * approval module read the same numbers.
 */
export const WAR_EXHAUSTION_FLOOR = -25;

export function warExhaustion(turnsSinceEntry: number): number {
  const raw = clamp(1 - turnsSinceEntry / TURNS_PER_YEAR, WAR_EXHAUSTION_FLOOR, 1);
  return Math.round(raw * 10) / 10;
}
