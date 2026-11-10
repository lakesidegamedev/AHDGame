/** Single-country features used by the api area. See countryFeatures.ts. */
import type { CountryId } from "@/lib/constants/countriesCore";

export const API_FEATURES = {} as const satisfies Record<string, readonly CountryId[]>;
