import type { CountryId } from "@/lib/constants/countries";
import { BILL_LIFECYCLE_COUNTRY_IDS } from "./billLifecycleCountries";

/**
 * Does this country's national bills get processed by an engine?
 * 26 countries are in `COUNTRY_BILL_PHASES`, plus the US whose lifecycle is
 * invoked directly from `billLifecycle.ts`. A bare table lookup silently
 * excludes the US, which is why this is a named helper.
 * Minting a bill for a country no engine walks leaves a permanent zombie with
 * nothing to close or report it.
 * Reads the id set, not the operational table, so callers don't pull the turn
 * engine in; a test pins the set to the table both ways.
 */
export function hasBillLifecycle(countryId: CountryId): boolean {
  return BILL_LIFECYCLE_COUNTRY_IDS.has(countryId);
}
