/** Single-country features used by the ui area. See countryFeatures.ts. */
import type { CountryId } from "@/lib/constants/countriesCore";

export const UI_FEATURES = {} as const satisfies Record<string, readonly CountryId[]>;
