/** Single-country features used by the turn area. See countryFeatures.ts. */
import type { CountryId } from "@/lib/constants/countriesCore";

export const TURN_FEATURES = {
  bgTurn: ["BG"],
  frTurn: ["FR"],
  huTurn: ["HU"],
  jpTurn: ["JP"],
  roTurn: ["RO"],
  ruTurn: ["RU"],
  scoTurn: ["SCO"],
  ukTurn: ["UK"],
  usTurn: ["US"],
  walTurn: ["WAL"],
} as const satisfies Record<string, readonly CountryId[]>;
