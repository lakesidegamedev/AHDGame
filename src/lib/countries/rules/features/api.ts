/** Single-country features used by the api area. See countryFeatures.ts. */
import type { CountryId } from "@/lib/constants/countriesCore";

export const API_FEATURES = {
  bgApi: ["BG"],
  cnApi: ["CN"],
  csApi: ["CS"],
  deApi: ["DE"],
  huApi: ["HU"],
  ieApi: ["IE"],
  jpApi: ["JP"],
  ngApi: ["NG"],
  roApi: ["RO"],
  ruApi: ["RU"],
  ukApi: ["UK"],
  usApi: ["US"],
  yuApi: ["YU"],
} as const satisfies Record<string, readonly CountryId[]>;
