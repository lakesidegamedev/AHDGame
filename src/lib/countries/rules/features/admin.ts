/** Single-country features used by the admin area. See countryFeatures.ts. */
import type { CountryId } from "@/lib/constants/countriesCore";

export const ADMIN_FEATURES = {} as const satisfies Record<string, readonly CountryId[]>;
