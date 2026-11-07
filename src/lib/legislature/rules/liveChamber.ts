import { COUNTRY_CONFIGS } from "@/lib/constants/countries";
/** Runtime territory departures shrink the Commons while tolerating its known seed discrepancy. */
export function liveSingleTierChamber(countryId: string, sum: number, base: number): number {
  if (countryId === COUNTRY_CONFIGS.UK.id && sum > 0 && sum < base - 2) return sum;
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
