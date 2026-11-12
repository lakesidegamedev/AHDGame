/** Single-country features used by the elections area. See countryFeatures.ts. */
import type { CountryId } from "@/lib/constants/countriesCore";

export const ELECTIONS_FEATURES = {
  balElections: ["BAL"],
  bgElections: ["BG"],
  blrElections: ["BLR"],
  brElections: ["BR"],
  cnElections: ["CN"],
  ddElections: ["DD"],
  deElections: ["DE"],
  huElections: ["HU"],
  ieElections: ["IE"],
  jpElections: ["JP"],
  roElections: ["RO"],
  ruElections: ["RU"],
  trElections: ["TR"],
  ukElections: ["UK"],
  ukrElections: ["UKR"],
  usElections: ["US"],
} as const satisfies Record<string, readonly CountryId[]>;
