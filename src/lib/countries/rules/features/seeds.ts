/** Single-country features used by the seeds area. See countryFeatures.ts. */
import type { CountryId } from "@/lib/constants/countriesCore";

export const SEEDS_FEATURES = {} as const satisfies Record<string, readonly CountryId[]>;
