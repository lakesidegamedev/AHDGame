import { getCountryConfig, type CountryId, isDirectElection } from "@/lib/constants/countries";
import type { Election } from "@/lib/db/types";

/**
 * Campaign Manager (Campaign doc, fundraising / ads / ground-game upgrades,
 * field offices, contribution UI) eligibility.
 *
 * Campaign Manager is the presidential campaign system: only a directly
 * elected executive qualifies. Every other race (US senate / house /
 * governor / state senate, UK commons, JP shugiin / sangiin / governor, ...)
 * campaigns through the per-character Actions loop instead.
 *
 * Any country whose `isDirectElection(config)` holds qualifies automatically,
 * even if the country itself isn't currently in the active set. Russia's
 * popular rounds additionally need a valid bound ballot.
 */
export function isCampaignEligibleElection(
  election: Pick<Partial<Election>, "countryId" | "electionType" | "russianPresidentialRound">
): boolean {
  const countryId = election.countryId;
  if (!countryId || election.electionType !== "president") return false;

  if (countryId === "RU" && election.russianPresidentialRound) {
    const binding = election.russianPresidentialRound;
    return (
      [1, 2].includes(binding.round) &&
      Number.isSafeInteger(binding.mandateSinceTurn) &&
      binding.mandateSinceTurn > 0 &&
      Number.isSafeInteger(binding.registeredVoters) &&
      binding.registeredVoters > 0
    );
  }
  return isDirectElection(getCountryConfig(countryId as CountryId));
}
