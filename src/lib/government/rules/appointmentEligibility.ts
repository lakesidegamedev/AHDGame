/** Minimum fraction of lower-chamber seats required for a minority government.
 *  Tuned so UK Commons (650) requires ≥100 seats; JP House of Reps (465) requires ≥72. */
export const MINORITY_SEAT_FRACTION = 0.1538;

export function minoritySeatThreshold(lowerChamberSeats: number): number {
  return Math.ceil(lowerChamberSeats * MINORITY_SEAT_FRACTION);
}

/**
 * Strength of a PM bid backed by `seats`. Minority bids stay allowed even when
 * another bloc holds a majority: the chamber votes the proposal down rather
 * than the gate suppressing it.
 */
export function classifyFormationSeats(
  seats: number,
  majorityThreshold: number,
  minorityThreshold: number
): "majority" | "minority" | null {
  if (seats >= majorityThreshold) return "majority";
  if (seats >= minorityThreshold) return "minority";
  return null;
}
