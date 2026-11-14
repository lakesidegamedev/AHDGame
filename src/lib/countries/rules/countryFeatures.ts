/**
 * Which countries host each country-specific feature. Routes and shells ask
 * `countryHasFeature` instead of comparing against a literal country code, so
 * enabling a feature elsewhere is a one-line data change.
 */
import type { CountryId } from "@/lib/constants/countriesCore";
import { ADMIN_FEATURES } from "./features/admin";
import { API_FEATURES } from "./features/api";
import { ELECTIONS_FEATURES } from "./features/elections";
import { LIB_FEATURES } from "./features/lib";
import { SEEDS_FEATURES } from "./features/seeds";
import { TURN_FEATURES } from "./features/turn";
import { UI_FEATURES } from "./features/ui";

export const COUNTRY_FEATURES = {
  /** Seeded Commons MPs can lead the official opposition without a player chair. */
  nppOppositionLeader: ["CA"],
  /** The head of government must retain an elected lower-chamber seat. */
  pmRequiresLowerSeat: ["UK", "CA"],
  /** A pinned singleplayer PM may keep the scenario office without a Commons seat. */
  pinnedSingleplayerPmSeatExemption: ["UK"],
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
  ...ADMIN_FEATURES,
  ...API_FEATURES,
  ...ELECTIONS_FEATURES,
  ...LIB_FEATURES,
  ...SEEDS_FEATURES,
  ...TURN_FEATURES,
  ...UI_FEATURES,
} as const satisfies Record<string, readonly CountryId[]>;

export type CountryFeature = keyof typeof COUNTRY_FEATURES;

/** Type predicate: a true result narrows `countryId` to the feature's listed countries. */
export function countryHasFeature<F extends CountryFeature>(
  feature: F,
  countryId: string | null | undefined
): countryId is (typeof COUNTRY_FEATURES)[F][number] {
  return (COUNTRY_FEATURES[feature] as readonly string[]).includes(countryId ?? "");
}
