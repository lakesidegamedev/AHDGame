/**
 * The PURE half of the private-enterprise regime question: no database, no
 * driver, safe to import from a client component.
 *
 * Split out of `privateEnterpriseGate`, which value-imports `ObjectId` from
 * `mongodb` and would ship the Mongo driver into the browser bundle.
 * Client-rendered code imports from HERE.
 *
 * Schedule-only: ignores persisted marketization drift and can disagree with
 * the live value near the threshold. Fine for a UI affordance; the server
 * route re-checks the live dial. NOT a write-path gate.
 */

import { COMMAND_CEILING, scheduledMarketizationLevel } from "@/lib/constants/commandEconomy";

/** Dual-track and above permits private enterprise; fully command does not. */
export function isPrivateEnterprisePermittedAtLevel(level: number): boolean {
  return level >= COMMAND_CEILING;
}

/**
 * Is private enterprise blocked in this country in this year, by the era
 * schedule alone? Unknown country or year reads as permitted.
 */
export function privateEnterpriseBlockedByYear(
  countryId: string | null | undefined,
  currentYear: number | null | undefined
): boolean {
  return !isPrivateEnterprisePermittedAtLevel(scheduledMarketizationLevel(countryId, currentYear));
}
