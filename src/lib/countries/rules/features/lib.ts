/** Single-country features used by the lib area. See countryFeatures.ts. */
import type { CountryId } from "@/lib/constants/countriesCore";

export const LIB_FEATURES = {} as const satisfies Record<string, readonly CountryId[]>;
