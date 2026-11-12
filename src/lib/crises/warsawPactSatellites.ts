import type { CountryId } from "@/lib/constants/countries";

/**
 * Warsaw Pact satellite states as playable/simulated countries (the Soviet
 * Union itself is "RU"). Scopes the Prague-Spring-style liberalization crisis
 * family and its cascade follow-ups. Own module to avoid a cycle between
 * `templates.ts` and `optionActions.ts`.
 */
export const WARSAW_PACT_SATELLITE_COUNTRY_IDS: CountryId[] = ["PL", "DD", "CS", "BG", "HU", "RO"];

export const USSR_COUNTRY_ID: CountryId = "RU";

/** USSR plus every satellite, the full bloc a Prague-Spring-style reform
 *  movement can be scoped to. */
export const WARSAW_PACT_BLOC_COUNTRY_IDS: CountryId[] = [
  USSR_COUNTRY_ID,
  ...WARSAW_PACT_SATELLITE_COUNTRY_IDS,
];
