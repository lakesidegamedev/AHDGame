/** Stat value that adjusts an event roll by nothing. */
export const ROLL_NEUTRAL_STAT = 5.5;
/** Roll points gained or lost per stat point away from neutral. */
export const ROLL_POINTS_PER_STAT = 4;

/** Roll adjustment an option's primary stat applies before the outcome tier is picked. */
export function statRollAdjustment(statValue: number): number {
  return Math.round((statValue - ROLL_NEUTRAL_STAT) * ROLL_POINTS_PER_STAT);
}
