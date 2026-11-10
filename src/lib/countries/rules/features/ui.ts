/** Single-country features used by the ui area. See countryFeatures.ts. */
import type { CountryId } from "@/lib/constants/countriesCore";

export const UI_FEATURES = {
  bgUi: ["BG"],
  brUi: ["BR"],
  cnUi: ["CN"],
  csUi: ["CS"],
  deUi: ["DE"],
  huUi: ["HU"],
  ieUi: ["IE"],
  jpUi: ["JP"],
  ngUi: ["NG"],
  roUi: ["RO"],
  ruUi: ["RU"],
  scoUi: ["SCO"],
  ukUi: ["UK"],
  usUi: ["US"],
  walUi: ["WAL"],
  yuUi: ["YU"],
} as const satisfies Record<string, readonly CountryId[]>;
