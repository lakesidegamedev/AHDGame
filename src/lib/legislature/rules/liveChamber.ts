import { SOVEREIGNTY_REGIONS } from "@/lib/referendum/rules/sovereigntyRegions";

/** Seats a region-summed chamber may fall short of its base before it counts as shrunk. */
const SEED_DISCREPANCY_TOLERANCE = 2;

/** Countries a region can leave, by independence or by joining another country. */
const DEPARTURE_COUNTRIES: ReadonlySet<string> = new Set(
  SOVEREIGNTY_REGIONS.filter((entry) => entry.actuates).map((entry) => entry.countryId)
);

/**
 * Live size of a chamber apportioned by region. A country that can lose a
 * region shrinks to its surviving total once the shortfall exceeds the known
 * seed discrepancy; every other chamber keeps at least its configured base and
 * grows when a region joins.
 */
export function liveSingleTierChamber(countryId: string, sum: number, base: number): number {
  if (DEPARTURE_COUNTRIES.has(countryId) && sum > 0 && sum < base - SEED_DISCREPANCY_TOLERANCE)
    return sum;
  return Math.max(sum, base);
}

/**
 * Chamber size a government formation measures its majority against.
 *
 * A list-tier (AMS) chamber is sized by config because its region districts
 * cover only the constituency half. When its seated roster is shorter than
 * that config, as a scaled-down seed roster is until the first election
 * allocates the list tier, measuring against the config left every government
 * a permanent minority. The seated total is the chamber that can actually
 * vote, so it sets the line until the chamber fills.
 */
export function formationChamberSeats(
  chamberSeats: number,
  seatedSeats: number,
  listTier: boolean
): number {
  return listTier && seatedSeats > 0 && seatedSeats < chamberSeats ? seatedSeats : chamberSeats;
}
