/**
 * Which countries host each country-specific feature. Routes and shells ask
 * `countryHasFeature` instead of comparing against a literal country code, so
 * enabling a feature elsewhere is a one-line data change.
 */
import type { CountryId } from "@/lib/constants/countriesCore";

export const COUNTRY_FEATURES = {
  /** Referendums, devolution policy, party conference and manifestos. */
  ukDevolutionAndConference: ["UK"],
  /** Commons recall petitions. */
  ukRecall: ["UK"],
  /** Supreme Court case docket and justice actions. */
  supremeCourtDocket: ["US"],
  /** Landesliste (state list) party management. */
  landesliste: ["DE"],
  /** Federal state-organisation building for campaigns. */
  stateOrganisations: ["US"],
  /** Constitution reform proposals by a head of state. */
  constitutionProposal: ["RU"],
} as const satisfies Record<string, readonly CountryId[]>;

export type CountryFeature = keyof typeof COUNTRY_FEATURES;

export function countryHasFeature(feature: CountryFeature, countryId: string | undefined): boolean {
  return (COUNTRY_FEATURES[feature] as readonly string[]).includes(countryId ?? "");
}
