/** Single-country features used by the turn area. See countryFeatures.ts. */
import type { CountryId } from "@/lib/constants/countriesCore";

export const TURN_FEATURES = {} as const satisfies Record<string, readonly CountryId[]>;
