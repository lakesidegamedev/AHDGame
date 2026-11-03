/** Pure scrutiny constants and helpers shared by the chair turn and the wiki charts. */

/** Infamy (scrutiny) threshold above which chair bonuses are halved */
export const INFAMY_PENALTY_THRESHOLD = 25;

/**
 * Controls how much high scrutiny dampens positive effects (infamy reduction).
 * Multiplier = max(0.1, 1 - chairInfamy / POSITIVE_DAMPENING_SCALE)
 * At 0 infamy: 1.0x (full effect). At 75: 0.5x. At 150+: 0.1x floor.
 */
export const POSITIVE_DAMPENING_SCALE = 150;

/** Multiplier applied to scrutiny relief at the given scrutiny level. */
export function scrutinyReliefDampener(currentInfamy: number): number {
  return Math.max(0.1, 1 - currentInfamy / POSITIVE_DAMPENING_SCALE);
}
