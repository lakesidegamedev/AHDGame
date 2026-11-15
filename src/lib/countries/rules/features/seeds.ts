/** Single-country features used by the seeds area. See countryFeatures.ts. */
import type { CountryId } from "@/lib/constants/countriesCore";

export const SEEDS_FEATURES = {
  brSeeds: ["BR"],
  cnSeeds: ["CN"],
  csSeeds: ["CS"],
  ddSeeds: ["DD"],
  esSeeds: ["ES"],
  frSeeds: ["FR"],
  huSeeds: ["HU"],
  ieSeeds: ["IE"],
  jpSeeds: ["JP"],
  ngSeeds: ["NG"],
  plSeeds: ["PL"],
  roSeeds: ["RO"],
  ruSeeds: ["RU"],
  scoSeeds: ["SCO"],
  ukSeeds: ["UK"],
  usSeeds: ["US"],
  walSeeds: ["WAL"],
  yuSeeds: ["YU"],
} as const satisfies Record<string, readonly CountryId[]>;
