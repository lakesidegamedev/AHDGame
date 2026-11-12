/**
 * A by-election contests only the vacated seat(s). Regions carry a seat count,
 * not constituencies, so the by-election runs over the regional electorate
 * scaled to vacatedSeats / totalRegionSeats, preserving the demographic mix.
 * Pure; callers pass the region's groups.
 */

export interface CarveGroup {
  id: string;
  /** Group population within the region (any consistent unit — shares are preserved). */
  population: number;
}

/**
 * Fraction of the region's electorate a by-election contests.
 * Clamped to [0, 1]; guards against a zero/negative seat total.
 */
export function computeByElectionCarveFraction(
  vacatedSeats: number,
  totalRegionSeats: number
): number {
  if (totalRegionSeats <= 0) return 0;
  const v = Math.max(0, vacatedSeats);
  return Math.max(0, Math.min(1, v / totalRegionSeats));
}

/**
 * Scale the regional electorate down to the vacated seats' population share.
 * Returns groups with the same ids and relative composition, populations scaled
 * by the carve fraction. Relative vote shares are unchanged; the pool size is
 * reduced so the race is sized to a single seat's worth of voters.
 */
export function scaleElectorateToVacatedSeats(
  groups: CarveGroup[],
  vacatedSeats: number,
  totalRegionSeats: number
): { fraction: number; groups: CarveGroup[] } {
  const fraction = computeByElectionCarveFraction(vacatedSeats, totalRegionSeats);
  return {
    fraction,
    groups: groups.map((g) => ({ id: g.id, population: g.population * fraction })),
  };
}

/** Total electorate size a by-election is contested over. */
export function byElectionElectorateSize(
  groups: CarveGroup[],
  vacatedSeats: number,
  totalRegionSeats: number
): number {
  const fraction = computeByElectionCarveFraction(vacatedSeats, totalRegionSeats);
  const regionTotal = groups.reduce((sum, g) => sum + Math.max(0, g.population), 0);
  return regionTotal * fraction;
}
